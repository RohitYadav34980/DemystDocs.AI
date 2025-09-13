import json
from google.api_core.client_options import ClientOptions
from typing import Optional
from google.cloud import documentai  # type: ignore
from google.cloud.documentai_v1.types import Document

# Simplified hardened sample for processing a local PDF with Document AI.

# TODO(developer): Uncomment these variables before running the sample.
project_id = "564920207750"
location = "us"  # Format is "us" or "eu"
processor_id = "d3a81dd708e4696a"  # Create processor before running sample
file_path = "C:/Users/yadav/OneDrive/Desktop/document-backend/RentDeed.pdf"
mime_type = "application/pdf"  # Refer to supported file types doc

# Optional overrides (explicitly defined to avoid NameError)
field_mask: Optional[str] = None  # e.g. "text,entities,pages.pageNumber"
processor_version_id: Optional[str] = None  # e.g. "YOUR_PROCESSOR_VERSION_ID"


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
    # print(type(document))
    document = Document.to_json(document)
    document = json.loads(document)
    # Read the text recognition output from the processor
    return document
    

if __name__ == "__main__":
    document = process_document_sample(file_path=file_path)
    with open("output.json", "w", encoding="utf-8") as f:
        json.dump(document, f, ensure_ascii=False, indent=2)
    print("Document processing complete.")

# [END documentai_process_document]