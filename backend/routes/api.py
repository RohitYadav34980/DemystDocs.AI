"""FastAPI wrapper exposing Document AI OCR functionality."""
from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Query
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import tempfile
import pathlib
from dotenv import load_dotenv

from lib import ocr
from lib.get_summary import get_summary as generate_summary
from lib.get_answer import answer_user_question
from lib.get_risk import get_risk_statments 

load_dotenv()
app = FastAPI(title="Document AI OCR API", version="0.1.0")

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,   
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],     
)


@app.get("/")
async def root():
    return {
        "message": "Welcome to Document AI OCR API",
        "docs_url": "/docs",
        "health_check": "/health"
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/get_ocr", summary="Extract plain text from uploaded file")
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
        return JSONResponse(text)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

@app.post("/get_summary", summary="Get summary of uploaded file")
async def get_summary_endpoint(request: Request, file_path: str = Query(default=None)):
    """Accept a Supabase file path (via query param ?file_path=... or JSON body {"file_path": "..."}) and return a summary."""
    try:
        # Allow both query param and JSON body
        if not file_path:
            try:
                body = await request.json()
                if isinstance(body, dict):
                    file_path = body.get("file_path")
            except Exception:
                # No/invalid JSON body; fall through to validation below
                pass

        if not file_path or not isinstance(file_path, str):
            raise HTTPException(status_code=422, detail="file_path is required")

        # Normalize: strip public URL prefix if provided
        prefix = "https://jmyrzhpfzcaebymsmjcm.supabase.co/storage/v1/object/public/ocr_bucket/"
        if file_path.startswith(prefix):
            file_path = file_path.replace(prefix, "", 1)

        summary = await generate_summary(file_path=file_path)
        return JSONResponse(summary)
    except HTTPException:
        # Re-raise HTTP exceptions untouched
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(e))
    
@app.post("/ask", summary="Ask a question about the uploaded file")
async def ask_question_endpoint(request: Request, question: str = Query(default=None), file_path: str = Query(default=None)):
    """Accept a question and a Supabase file path (via query params ?question=...&file_path=... or JSON body {"question": "...", "file_path": "..."}) and return an answer."""
    try:
        # Allow both query params and JSON body
        if not question or not file_path:
            try:
                body = await request.json()
                if isinstance(body, dict):
                    if not question:
                        question = body.get("question")
                    if not file_path:
                        file_path = body.get("file_path")
            except Exception:
                # No/invalid JSON body; fall through to validation below
                pass

        if not question or not isinstance(question, str):
            raise HTTPException(status_code=422, detail="question is required")
        if not file_path or not isinstance(file_path, str):
            raise HTTPException(status_code=422, detail="file_path is required")

        response = answer_user_question(question=question, file_url=file_path)
        return JSONResponse({"response": response})
    except HTTPException:
        # Re-raise HTTP exceptions untouched
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/get_risk", summary="Get risk statements from uploaded file")
async def get_risk_endpoint(request: Request, file_path: str = Query(default=None)):
    """Accept a Supabase file path (via query param ?file_path=... or JSON body {"file_path": "..."}) and return risk statements."""
    try:
        # Allow both query param and JSON body
        if not file_path:
            try:
                body = await request.json()
                if isinstance(body, dict):
                    file_path = body.get("file_path")
            except Exception:
                # No/invalid JSON body; fall through to validation below
                pass

        if not file_path or not isinstance(file_path, str):
            raise HTTPException(status_code=422, detail="file_path is required")

        risk_statements = get_risk_statments(file_url=file_path)
        return JSONResponse(risk_statements)
    except HTTPException:
        # Re-raise HTTP exceptions untouched
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(e))