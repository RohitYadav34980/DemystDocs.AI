import json
import os
from dotenv import load_dotenv
from typing import List, Dict

from google.cloud import aiplatform
from google.cloud.aiplatform_v1beta1.types import FindNeighborsRequest, IndexDatapoint
from google.cloud.aiplatform.matching_engine.matching_engine_index_endpoint import Namespace, NumericNamespace
import google.generativeai as genai
from vertexai.language_models import TextEmbeddingModel
from .rag_builder import create_chunks_from_doc_ai_json

load_dotenv()

PROJECT_ID = os.getenv("PROJECT_ID")
LOCATION = "us-central1"  # e.g., us-central1
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)

# Make sure you have created this index in the Google Cloud Console
VECTOR_SEARCH_INDEX_ID = os.getenv("VECTOR_SEARCH_INDEX_ID")
VECTOR_SEARCH_ENDPOINT_ID = os.getenv("VECTOR_SEARCH_ENDPOINT_ID")
DEPLOYED_INDEX_ID=os.getenv("DEPLOYED_INDEX_ID")

MIN_CHUNK_CHAR_LEN = 30
MIN_CHUNK_WORDS = 5
MAX_CONTEXT_CHUNKS = 10
MIN_CONTEXT_CHUNKS = 5

# Helper functions for text filtering
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


def answer_user_question(question: str, file_url: str) -> str:
    """
    Answers a user's question by performing a RAG pipeline search.
    """
    # print("\n--- Starting RAG process for a new question ---")

    file_url = file_url.replace("https://jmyrzhpfzcaebymsmjcm.supabase.co/storage/v1/object/public/ocr_bucket/", "")
    document_id = file_url[5:-5:]

    # 0. Load and chunk the document
    original_chunks = create_chunks_from_doc_ai_json(file_url, document_id)

    # print(f"Question: {question}")

    # Initialize models and index endpoint
    aiplatform.init(project=PROJECT_ID, location=LOCATION)
    embedding_model = TextEmbeddingModel.from_pretrained("text-embedding-004")
    model = genai.GenerativeModel("gemini-2.5-flash")
    index_endpoint = aiplatform.MatchingEngineIndexEndpoint(
        index_endpoint_name=VECTOR_SEARCH_ENDPOINT_ID
    )

    # 1. Embed the user's question
    embedding_response = embedding_model.get_embeddings([question])
    question_embedding = embedding_response[0].values
    # print("1. Question embedded.")

    # 2. Search the index for relevant chunks, filtering by document_id
    search_results = index_endpoint.find_neighbors(
        deployed_index_id=DEPLOYED_INDEX_ID,
        queries=[question_embedding],
        num_neighbors=25,
        filter=[ Namespace(name="document_id", allow_tokens=[document_id], deny_tokens=[]) ],
    )
    # print("2. Vector search complete.")

    # 3. Retrieve and post-filter the top matching chunks
    chunks_map = {
        chunk['id']: chunk['text']
        for chunk in original_chunks
        if chunk.get('document_id') == document_id
    }

    relevant_texts: List[str] = []
    if search_results and search_results[0]:
        for match in search_results[0]:
            # In your SDK, neighbor ID may be 'id' or 'datapoint_id'
            chunk_id = getattr(match, "datapoint_id", None) or getattr(match, "id", None)
            if not chunk_id:
                continue

            context_text = _normalize_ws(chunks_map.get(chunk_id, ""))
            if not context_text or _is_low_value(context_text):
                continue
            if context_text.lower() in {t.lower() for t in relevant_texts}:
                continue
            relevant_texts.append(context_text)
            if len(relevant_texts) >= MAX_CONTEXT_CHUNKS:
                break

    # Fallback: relax filters if fewer than MIN_CONTEXT_CHUNKS
    if len(relevant_texts) < MIN_CONTEXT_CHUNKS and search_results and search_results[0]:
        for match in search_results[0]:
            if len(relevant_texts) >= MIN_CONTEXT_CHUNKS:
                break

            chunk_id = getattr(match, "datapoint_id", None) or getattr(match, "id", None)
            if not chunk_id:
                continue

            context_text = _normalize_ws(chunks_map.get(chunk_id, ""))
            if not context_text:
                continue
            if _looks_like_heading(context_text):
                continue
            if _is_mostly_non_alpha(context_text):
                continue
            if context_text.lower() in {t.lower() for t in relevant_texts}:
                continue
            relevant_texts.append(context_text)


    relevant_context = "\n\n".join(relevant_texts)
    # print("3. Retrieved context from original chunks.")
    # print("Relevant Context:\n", relevant_context)

    # 4. Construct the final prompt
    final_prompt = f"""
    You are a helpful assistant. Answer the user's question based ONLY on the context provided below.
    If the answer is not in the context, clearly state that you could not find the answer in the document.
    Always reply in a beginners english tone.
    The answer should be elaborate and detailed.

    Context:
    ---
    {relevant_context}
    ---

    Question: {question}
    """

    # 5. Get the final answer from the generation model
    response = model.generate_content(final_prompt)
    # print("4. Generated final answer from Gemini.")

    return response.text.strip()

if __name__ == "__main__":

    # Example usage
    example_question = "What is the document about?"
    example_file_url = "https://jmyrzhpfzcaebymsmjcm.supabase.co/storage/v1/object/public/ocr_bucket/ocr/794bd64f-22ce-4840-af5b-2d7fe3f039c0.json"
    answer = answer_user_question(example_question, example_file_url)
    print("\nFinal Answer:\n", answer)