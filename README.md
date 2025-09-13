# Document Backend

FastAPI starter backend structured for clean expansion. Frontend can run on another machine and consume the versioned API.

## Structure
```
app/
  main.py              # FastAPI application instance
  core/
    config.py          # Settings / configuration
  db/
    session.py         # Database engine + session dependency
  api/
    routes.py          # Aggregate / top-level API router
    deps.py            # Shared dependencies
    endpoints/
      health.py        # Example health endpoint
  documents.py     # Upload, summary, QA endpoints
  models/              # SQLAlchemy models (to add)
  schemas/             # Pydantic schemas (to add)
  services/            # Business logic / service layer
requirements.txt        # Dependencies
README.md
```

## Quick start
Install deps:
```
pip install -r requirements.txt
```
Run dev server:
```
uvicorn app.main:app --reload
```
Health check:
```
GET http://localhost:8000/api/v1/health/
```
Root welcome:
```
GET http://localhost:8000/
```

## Adding a new endpoint
1. Create a file under `app/api/endpoints/` (e.g. `documents.py`).
2. Define a router and routes.
3. Import and include in `app/api/routes.py` with `api_router.include_router(...)`.
4. Add schemas in `app/schemas` and models in `app/models` as needed.

## Environment variables
Create a `.env` file (same directory as `requirements.txt`):
```
APP_NAME=DocumentBackend
DEBUG=True
DATABASE_URL=sqlite+aiosqlite:///./app.db
ALLOWED_ORIGINS=["*"]
```

## Migrations (Alembic)
Initialize later with:
```
alembic init migrations
```
Update `env.py` to use the `engine` from `app.db.session`.

## Notes
- Uses async SQLAlchemy setup (no models yet). Add models inheriting from `Base` in `app/db/session.py`.
- Keep services (business logic) separate from endpoints for testability.
 - Current document processing, summary, and QA endpoints use in-memory stores and mock AI logic. Replace with real Google Cloud Document AI, Vertex AI (Gemini + embeddings + vector search) when credentials/config are ready.

## API Overview (current prototype)

1. POST /api/v1/documents/upload (multipart/form-data)
  - file: the PDF/document
  - Response: { document_id, filename, status }
2. POST /api/v1/documents/summary
  - Body: { document_id }
  - Response: { document_id, summary, risks: [...] }
3. POST /api/v1/documents/qa
  - Body: { document_id, question }
  - Response: { document_id, question, answer, sources: [...] }

Health:
GET /api/v1/health/
