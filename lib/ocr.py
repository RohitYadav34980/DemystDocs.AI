import json
import os
import uuid
from supabase import create_client, Client
from dotenv import load_dotenv
from google.api_core.client_options import ClientOptions
from typing import Optional
from google.cloud import documentai  # type: ignore
from google.cloud.documentai_v1.types import Document

load_dotenv()  # Load environment variables from .env file
# Simplified hardened sample for processing a local PDF with Document AI.

project_id = os.getenv("PROJECT_ID")  # e.g. "my-project-id"
location = os.getenv("LOCATION")  # Format is "us" or "eu"
processor_id = os.getenv("PROCESSOR_ID")  # Create processor before running sample
file_path = "rent.pdf"
mime_type = "application/pdf"  # Refer to supported file types doc

# Optional overrides (explicitly defined to avoid NameError)
field_mask: Optional[str] = None  # e.g. "text,entities,pages.pageNumber"
processor_version_id: Optional[str] = None  # e.g. "YOUR_PROCESSOR_VERSION_ID"

# Initialize Supabase client
url: str = os.environ.get("SUPABASE_URL")
key: str = os.environ.get("SUPABASE_KEY")
supabase: Client = create_client(url, key)

def process_document_sample(
    file_path: str,
) -> dict:
    """Process a local document file with Document AI and return recognized text.

    Args:
        file_path: Absolute or relative path to the document (PDF/image).

    Returns:
        Extracted plain text from the processed document.
    """
    # You must set the `api_endpoint` if you use a location other than "us".
    opts = ClientOptions(api_endpoint=f"{location}-documentai.googleapis.com")

    client = documentai.DocumentProcessorServiceClient(client_options=opts)

    if processor_version_id:
        name = client.processor_version_path(
            project_id, location, processor_id, processor_version_id
        )
    else:
        name = client.processor_path(project_id, location, processor_id)

    # Read the file into memory
    with open(file_path, "rb") as image:
        image_content = image.read()

    # Load binary data
    raw_document = documentai.RawDocument(content=image_content, mime_type=mime_type)

    # Optional processing configuration.
    # For more information: https://cloud.google.com/document-ai/docs/reference/rest/v1/ProcessOptions
    process_options = documentai.ProcessOptions(
        ocr_config=documentai.OcrConfig(
            enable_native_pdf_parsing=True
        ),
    )

    # Configure the process request
    request_kwargs = {
        "name": name,
        "raw_document": raw_document,
        "process_options": process_options,
    }
    if field_mask:
        request_kwargs["field_mask"] = field_mask
    request = documentai.ProcessRequest(**request_kwargs)

    result = client.process_document(request=request)

    # For a full list of `Document` object attributes, reference this page:
    # https://cloud.google.com/document-ai/docs/reference/rest/v1/Document
    document = result.document

    document = Document.to_json(document)
    document = json.loads(document)

    # push file to supabase
    file_path = f"ocr/{str(uuid.uuid4())}.json"
    response  = (
        supabase.storage
        .from_("ocr_bucket")
        .upload(
            path=file_path,
            file = json.dumps(document).encode('utf-8'),
        )
    )
    
    #get public url
    public_url = (
        supabase.storage
        .from_("ocr_bucket")
        .get_public_url(file_path)
    )
    print("File uploaded to Supabase Storage.")

    return {"url" : public_url}
    

if __name__ == "__main__":
    document = process_document_sample(file_path=file_path)
    with open("output.json", "w", encoding="utf-8") as f:
        json.dump(document, f, ensure_ascii=False, indent=2)
    print("Document processing complete.")

