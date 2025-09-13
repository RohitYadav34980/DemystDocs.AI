"""FastAPI wrapper exposing Document AI OCR functionality."""
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse, PlainTextResponse
from typing import List, Optional
import os
import tempfile
import pathlib

from . import ocr

app = FastAPI(title="Document AI OCR API", version="0.1.0")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/ocr:text", response_class=PlainTextResponse, summary="Extract plain text from uploaded file")
async def ocr_text(file: UploadFile = File(...)):
    """Accept a file upload, persist temporarily, run Document AI OCR, return plain text."""
    # Derive a safe suffix from original filename (helps Document AI infer type via mime argument we already set internally)
    original_name = pathlib.Path(file.filename or "upload.bin")
    suffix = original_name.suffix if original_name.suffix else ""

    tmp_path = None
    try:
        content = await file.read()
        if not content:
            raise ValueError("Uploaded file is empty")

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        # Call OCR with the filesystem path
        text = ocr.process_document_sample(file_path=tmp_path)
        return text
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

