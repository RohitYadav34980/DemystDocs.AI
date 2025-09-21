import os
import json
import asyncio
from dotenv import load_dotenv
from typing import Dict

from supabase import create_client, Client
import google.generativeai as genai
from .rag_builder import create_rag

load_dotenv()  # Load environment variables from .env file

# Initialize Supabase client
url: str = os.getenv("SUPABASE_URL")
key: str = os.getenv("SUPABASE_KEY")
bucket:str = os.getenv("SUPABASE_BUCKET")
supabase: Client = create_client(url, key)

# Initialize Generative AI client
genai.configure(api_key=os.getenv("GENAI_API_KEY"))

async def get_summary(file_path: str) -> Dict[str, str]:
    """Generate a summary for the document at the given Supabase file path.

    Args:
        file_path: The path to the file in the Supabase storage bucket.
    Returns:
        A dictionary containing the summary text.
    """
    # Run RAG and (download+generate) in parallel
    rag_task = asyncio.to_thread(create_rag, file_path)

    def _download_and_generate() -> str:
        resp = supabase.storage.from_(bucket).download(file_path)
        print(f"=============Downloaded file content from supabase")  # Print first 100 characters for debugging
        decoded = resp.decode("utf-8") if isinstance(resp, (bytes, bytearray)) else str(resp)
        try:
            data = json.loads(decoded)
            content_text = data.get("text", decoded) if isinstance(data, dict) else decoded
        except json.JSONDecodeError:
            content_text = decoded

        model = genai.GenerativeModel("gemini-2.5-flash")
        prompt = "Summarize the following document content in a concise manner:\n\n"f"{content_text}\n\nSummary:"
        response = model.generate_content(
            prompt
        )
        return response.candidates[0].content.parts[0].text

    summary_text, _ = await asyncio.gather(asyncio.to_thread(_download_and_generate), rag_task)
    return {"summary": summary_text}

if __name__ == "__main__":
    file_path = "ocr/794bd64f-22ce-4840-af5b-2d7fe3f039c0.json"
    response = asyncio.run(get_summary(file_path))
    print(response)
    print(type(response))