# DemystDocs.AI – Diagrams

This page documents the system at a glance. All diagrams use Mermaid (GitHub-compatible syntax).

## High-level process flow

```mermaid
flowchart TB
  user[User] -->|Login or Signup| fe[React Frontend]
  user -->|Upload PDF or DOCX| fe

  fe -->|POST get_ocr file| be[FastAPI Backend]
  be -->|Process file| docai[Google Document AI]
  docai -->|OCR JSON| sb[(Supabase Storage ocr_bucket)]
  be -->|Return public JSON URL| fe

  fe -->|POST get_summary file_path| be
  be -->|Download OCR JSON| sb
  be -->|create_rag: chunk -> embed -> upsert| vs[Vertex AI Vector Search]
  be -->|Summarize| gemini[Gemini]
  gemini --> be
  be --> fe

  fe -->|POST ask question and file_path| be
  be -->|Load chunks| sb
  be -->|Find neighbors filter by document_id| vs
  be -->|Generate answer with context| gemini
  gemini --> be
  be --> fe

  fe -->|POST get_risk file_path| be
  be -->|Load OCR text| sb
  be -->|Extract risks| gemini
  gemini --> be
  be --> fe
```

## Sequence – Upload and OCR

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant FE as Frontend (React)
  participant BE as Backend (FastAPI)
  participant DA as Document AI
  participant SB as Supabase Storage

  U->>FE: Select PDF or DOCX
  FE->>BE: POST get_ocr multipart file
  BE->>DA: Process document OCR
  DA-->>BE: Structured OCR result JSON
  BE->>SB: Upload OCR JSON to ocr_bucket
  SB-->>BE: Public URL
  BE-->>FE: { url: public_url }
  FE->>U: Navigate to Review page with jsonUrl
```

## Sequence – Summarize

```mermaid
sequenceDiagram
  autonumber
  participant FE as Frontend (React)
  participant BE as Backend (FastAPI)
  participant SB as Supabase Storage
  participant VS as Vertex Vector Search
  participant GM as Gemini

  FE->>BE: POST get_summary file_path
  par In parallel
    BE->>SB: Download OCR JSON
    BE->>VS: create_rag file_path
    Note right of VS: chunk -> embed -> upsert
  end
  BE->>GM: Generate concise summary from content
  GM-->>BE: summary
  BE-->>FE: { summary }
```

## Sequence – Ask a question (RAG)

```mermaid
sequenceDiagram
  autonumber
  participant FE as Frontend (React)
  participant BE as Backend (FastAPI)
  participant SB as Supabase Storage
  participant VS as Vertex Vector Search
  participant GM as Gemini

  FE->>BE: POST ask question and file_path
  BE->>SB: Load OCR chunks
  BE->>VS: find_neighbors filter by document_id
  VS-->>BE: Top k chunk IDs
  BE->>SB: Map IDs to original chunk text
  BE->>GM: Generate answer using context
  GM-->>BE: response text
  BE-->>FE: { response }
```

## Use cases

```mermaid
flowchart LR
  user([User])
  uc1((Authenticate with Google))
  uc2((Upload Document))
  uc3((View Extracted Text))
  uc4((View Summary))
  uc5((Ask Questions Chat))
  uc6((View Risk Statements))
  uc7((Review Document))

  user --> uc1
  user --> uc2
  user --> uc3
  user --> uc4
  user --> uc5
  user --> uc6
  user --> uc7
```

## Actors and components

- User: interacts via web UI
- Frontend: React + Vite app, routes for login, signup, upload, review
- Backend: FastAPI with endpoints
  - POST /get_ocr
  - POST /get_summary
  - POST /ask
  - POST /get_risk
- External services
  - Google Document AI (OCR)
  - Vertex AI: Text Embeddings + Matching Engine (Vector Search)
  - Gemini (Generative answers and summarization)
  - Supabase Storage (stores OCR JSON)
