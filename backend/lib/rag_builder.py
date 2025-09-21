import json
import os
from dotenv import load_dotenv
from typing import List, Dict

from google.cloud import aiplatform
from google.cloud.aiplatform_v1beta1.types import FindNeighborsRequest, IndexDatapoint
from google.cloud.aiplatform.matching_engine.matching_engine_index_endpoint import Namespace, NumericNamespace
import google.generativeai as genai
from vertexai.language_models import TextEmbeddingModel
from supabase import create_client, Client

load_dotenv()
# --- 1. Configuration - Replace with your values ---
PROJECT_ID = os.getenv("PROJECT_ID")
LOCATION = "us-central1"  # e.g., us-central1

# Make sure you have created this index in the Google Cloud Console
VECTOR_SEARCH_INDEX_ID = os.getenv("VECTOR_SEARCH_INDEX_ID")
VECTOR_SEARCH_ENDPOINT_ID = os.getenv("VECTOR_SEARCH_ENDPOINT_ID")
DEPLOYED_INDEX_ID=os.getenv("DEPLOYED_INDEX_ID")

# Initialize Supabase client
url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_KEY")
bucket: str = os.getenv("SUPABASE_BUCKET")
supabase: Client = create_client(url, key)


# This will be the unique identifier for the document you're processing
# In a real app, you would generate this dynamically for each upload
# DOCUMENT_ID = "test" 
LOCAL_JSON_FILE_PATH = "https://jmyrzhpfzcaebymsmjcm.supabase.co/storage/v1/object/public/ocr_bucket/ocr/794bd64f-22ce-4840-af5b-2d7fe3f039c0.json"

# Heuristics for cleaning and filtering
MIN_CHUNK_CHAR_LEN = 30
MIN_CHUNK_WORDS = 5
MAX_CONTEXT_CHUNKS = 10
MIN_CONTEXT_CHUNKS = 5

def _normalize_ws(text: str) -> str:
    return " ".join((text or "").split()).strip()

def _is_mostly_non_alpha(text: str) -> bool:
    if not text:
        return True
    letters = sum(ch.isalpha() for ch in text)
    return letters / max(1, len(text)) < 0.3

def _looks_like_heading(text: str) -> bool:
    if not text:
        return True
    t = text.strip()
    if len(t) <= 2:
        return True
    # Bulleted/numbered heading patterns
    import re
    if re.match(r"^(?:[-*•]\s|\d+\s*[.)-]\s)", t):
        return True
    # Ends with colon
    if t.endswith(":"):
        return True
    # Short, title/upper case and no sentence punctuation
    words = t.split()
    if len(words) <= 6 and (t.isupper() or t == t.title()) and ("." not in t and "?" not in t):
        return True
    return False

def _is_low_value(text: str) -> bool:
    t = _normalize_ws(text)
    if not t:
        return True
    if len(t) < MIN_CHUNK_CHAR_LEN:
        # allow short if it looks like a proper sentence
        if ("." in t or "?" in t) and len(t.split()) >= MIN_CHUNK_WORDS:
            pass
        else:
            return True
    if len(t.split()) < MIN_CHUNK_WORDS:
        return True
    if _is_mostly_non_alpha(t):
        return True
    if _looks_like_heading(t):
        return True
    return False

# --- Helper function to extract text from Document AI's layout ---
def get_text_from_layout(layout: dict, full_text: str) -> str:
    """
    Extracts text segments from the full document text based on a layout object.
    """
    response = ""
    for segment in layout.get('textAnchor', {}).get('textSegments', []):
        start_index = int(segment.get('startIndex', 0))
        end_index = int(segment.get('endIndex', 0))
        response += full_text[start_index:end_index]
    return response

# --- Step 1: Chunking ---
def create_chunks_from_doc_ai_json(file_path: str, DOCUMENT_ID: str) -> List[Dict]:
    """
    Loads a Document AI JSON response and extracts paragraphs as text chunks.
    """
    #print("Step 1: Starting the chunking process...")
    
    response = supabase.storage.from_(bucket).download(file_path)
    doc_ai_json = json.loads(response)

    full_text = doc_ai_json.get('text', '')
    chunks = []
    
    for page_num, page in enumerate(doc_ai_json.get('pages', [])):
        for paragraph_num, paragraph in enumerate(page.get('paragraphs', [])):
            paragraph_text = get_text_from_layout(paragraph.get('layout', {}), full_text)
            
            # Basic cleaning & filtering
            cleaned_text = _normalize_ws(paragraph_text)

            if cleaned_text and not _is_low_value(cleaned_text):
                chunk_id = f"{DOCUMENT_ID}_page_{page_num+1}_para_{paragraph_num+1}"
                chunks.append({
                    "id": chunk_id,
                    "text": cleaned_text,
                    "document_id": DOCUMENT_ID,
                    "page_number": page_num + 1
                })
    
    #print(f"-> Successfully created {len(chunks)} chunks.")
    return chunks

# --- Step 2: Embedding ---
def embed_text_chunks(chunks: List[Dict]) -> List[Dict]:
    """
    Takes a list of chunk dicts and adds a vector embedding to each.
    """
    #print("Step 2: Starting the embedding process...")
    
    # Deduplicate and filter again defensively
    seen = set()
    filtered_chunks: List[Dict] = []
    for ch in chunks:
        t = _normalize_ws(ch.get("text", ""))
        key = t.lower()
        if not t or _is_low_value(t) or key in seen:
            continue
        seen.add(key)
        ch["text"] = t
        filtered_chunks.append(ch)

    if not filtered_chunks:
        #print("-> No valid chunks to embed after filtering.")
        return []

    model = TextEmbeddingModel.from_pretrained("text-embedding-004")
    text_to_embed = [chunk['text'] for chunk in filtered_chunks]
    
    # The API has a limit on the number of texts per call
    batch_size = 200
    all_embeddings = []
    
    for i in range(0, len(text_to_embed), batch_size):
        batch = text_to_embed[i:i + batch_size]
        embeddings = model.get_embeddings(batch)
        all_embeddings.extend(embeddings)
        #print(f"  -> Embedded batch {i // batch_size + 1} ({len(batch)} texts)")

    # Add the vector back to its corresponding chunk dict
    for i, chunk in enumerate(filtered_chunks):
        chunk['vector'] = all_embeddings[i].values
    
    #print(f"-> Successfully embedded all {len(filtered_chunks)} chunks (from {len(chunks)} input chunks).")
    return filtered_chunks

# --- Step 3: Storing & Indexing ---
def store_vectors_in_vector_search(chunks_with_vectors: List[Dict]):
    """
    Upserts the vectors into the specified Vertex AI Vector Search index.
    """
    #print("Step 3: Storing vectors in Vector Search...")
    
    aiplatform.init(project=PROJECT_ID, location=LOCATION)
    
    # Get the index endpoint for search (unused here) and the index for upserting
    _ = aiplatform.MatchingEngineIndexEndpoint(
        index_endpoint_name=VECTOR_SEARCH_ENDPOINT_ID
    )
    # Use MatchingEngineIndex to upsert datapoints
    index = aiplatform.MatchingEngineIndex(
        index_name=VECTOR_SEARCH_INDEX_ID
    )

    # Prepare datapoints for upserting
    datapoints_to_upsert = []
    for chunk in chunks_with_vectors:
        datapoint = {
            "datapoint_id": chunk['id'],
            "feature_vector": chunk['vector'],
            "restricts": [{
                "namespace": "document_id",
                "allow_list": [chunk['document_id']]
            }]
        }
        datapoints_to_upsert.append(datapoint)

    # Upsert the data in batches
    batch_size = 100
    for i in range(0, len(datapoints_to_upsert), batch_size):
        batch = datapoints_to_upsert[i:i+batch_size]
        # Upsert into the index
        index.upsert_datapoints(datapoints=batch)

    #print(f"-> Successfully stored {len(datapoints_to_upsert)} vectors.")


def create_rag(file_path: str):
    """
    Orchestrates the entire RAG process for a given document file path.
    """
    # --- Main execution block ---
    # --- This part is the ONE-TIME SETUP for a new document ---
    # 1. Chunking
    bucket_file_path = file_path.replace("https://jmyrzhpfzcaebymsmjcm.supabase.co/storage/v1/object/public/ocr_bucket/", "")
    document_id = bucket_file_path[5:-5:]
    chunks = create_chunks_from_doc_ai_json(bucket_file_path, document_id)

    # 2. Embedding
    chunks_with_vectors = embed_text_chunks(chunks)
    
    # 3. Storing
    store_vectors_in_vector_search(chunks_with_vectors)
    
    #print("\n--- Document processing and indexing complete. The system is ready for questions. ---\n")
    
    return 
                               

# --- Main execution block ---
if __name__ == "__main__":
    # --- This part is the ONE-TIME SETUP for a new document ---
    # 1. Chunking
    bucket_file_path = LOCAL_JSON_FILE_PATH.replace("https://jmyrzhpfzcaebymsmjcm.supabase.co/storage/v1/object/public/ocr_bucket/", "")
    document_id = bucket_file_path[5:-5:]
    #print(f"Document ID: {document_id}")
    chunks = create_chunks_from_doc_ai_json(bucket_file_path,document_id)
    
    # 2. Embedding
    chunks_with_vectors = embed_text_chunks(chunks)
    
    # # 3. Storing
    store_vectors_in_vector_search(chunks_with_vectors)
    
    ##print("\n--- Document processing and indexing complete. The system is ready for questions. ---\n")