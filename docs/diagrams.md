# DemystDocs.AI – Diagrams

This page documents the system at a glance. All diagrams use Mermaid (GitHub-compatible syntax).

## High-level process flow

```mermaid
flowchart LR
  %% Lanes
  subgraph CLI[Client]
    user[User]
  end
  subgraph FE[Frontend React]
    fe[Web app]
  end
  subgraph BE[Backend FastAPI]
    api[API]
  end
  subgraph EXT[External Services]
    docai[Google Document AI]
    supabase[(Supabase Storage)]
    vertex[Vertex AI Vector Search]
    gemini[Gemini Model]
  end

  %% Entry
  user --> fe

  %% Upload and OCR
  fe -->|Upload| api
  api -->|OCR| docai
  docai -->|JSON| supabase
  api -->|OCR URL| fe

  %% Summarize
  fe -->|Summarize| api
  api -->|Read JSON| supabase
  api -->|RAG setup| vertex
  api -->|Generate| gemini
  gemini --> api
  api -->|Summary| fe

  %% Ask (RAG)
  fe -->|Ask| api
  api -->|Retrieve| vertex
  api -->|Generate| gemini
  gemini --> api
  api -->|Answer| fe

  %% Risk extraction
  fe -->|Risk| api
  api -->|Read JSON| supabase
  api -->|Extract| gemini
  gemini --> api
  api -->|Risks| fe
```

## Architectural flow diagram

```mermaid
flowchart LR
  %% Client
  subgraph Client
    browser[Browser]
  end

  %% Frontend
  subgraph Frontend [Frontend React and Vite]
    app[React SPA]
    proxy[Vite Proxy api]
    auth[Firebase Auth]
  end

  %% Backend
  subgraph Backend [Backend FastAPI]
    api[FastAPI API]
  end

  %% External Services
  subgraph External Services
    googleAuth[Google Auth Provider]
    docai[Google Document AI]
    supabase[(Supabase Storage ocr_bucket)]
    vertex[Vertex AI Vector Search]
    gemini[Gemini Model]
  end

  %% Navigation and auth
  browser --> app
  app --> auth
  auth --> googleAuth

  %% API access (dev proxy and direct)
  app --> proxy
  proxy --> api
  app --> api

  %% Backend integrations
  api --> docai
  api --> supabase
  api --> vertex
  api --> gemini
  api --> app

  %% Data flow annotations
  api -. store OCR JSON .-> supabase
  api -. download OCR JSON .-> supabase
  api -. upsert vectors .-> vertex
  api -. generate text .-> gemini
```

Notes
- In development, the Vite proxy forwards requests from path api to the backend. In production, the SPA can call the backend directly.
- Supabase stores OCR JSON outputs produced by Document AI.
- Vertex Vector Search stores document chunks as vectors for retrieval augmented generation.
- Gemini is used for summarization, Q and A, and risk extraction prompts.

## Use case diagram – detailed

```mermaid
flowchart LR
  %% Actors
  user[User]
  extGoogle[Google Auth Provider]
  extSB[Supabase Storage]
  extDocAI[Google Document AI]
  extVS[Vertex AI Vector Search]
  extGemini[Gemini]

  %% System boundary
  subgraph System[DemystDocs.AI System]
    ucLogin((Authenticate))
    ucUpload((Upload Document))
    ucOCR((Extract OCR and Store))
    ucView((View Extracted Text))
    ucSummary((Summarize Document))
    ucAsk((Ask Questions))
    ucRisk((Risk Extraction))
    ucReview((Review Document))
  end

  %% Primary relationships
  user --> ucLogin
  user --> ucUpload
  user --> ucView
  user --> ucSummary
  user --> ucAsk
  user --> ucRisk
  user --> ucReview

  %% Includes / dependencies inside the system
  ucUpload -. include .-> ucOCR
  ucSummary -. uses .-> ucOCR
  ucAsk -. uses .-> ucOCR
  ucRisk -. uses .-> ucOCR

  %% External interactions
  ucLogin --- extGoogle
  ucOCR --- extDocAI
  ucOCR --- extSB
  ucSummary --- extSB
  ucSummary --- extVS
  ucSummary --- extGemini
  ucAsk --- extVS
  ucAsk --- extGemini
  ucRisk --- extSB
  ucRisk --- extGemini
```

### Use case notes

- Authenticate: Google Sign-In via Firebase on the frontend; session state drives access to upload and review.
- Upload Document: User selects PDF or DOCX; sent to backend for OCR.
- Extract OCR and Store: Backend runs Document AI, stores JSON in Supabase, returns public URL.
- View Extracted Text: Frontend loads OCR JSON and renders text overlay.
- Summarize Document: Backend downloads OCR JSON, runs RAG setup, summarizes via Gemini.
- Ask Questions: Backend embeds question, retrieves context via Vertex Vector Search, answers with Gemini.
- Risk Extraction: Backend prompts Gemini to extract risky statements with strict JSON output.
- Review Document: Combined view of extracted text, summary, Q and A, and risks.

## Sequence – Upload and OCR

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant FE as Frontend React
  participant BE as Backend FastAPI
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
  participant FE as Frontend React
  participant BE as Backend FastAPI
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
  participant FE as Frontend React
  participant BE as Backend FastAPI
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

## Process diagrams – endpoint specifics

### Process: get_ocr

```mermaid
flowchart TB
  start([Start])
  recv[Receive file]
  valid{File present and non empty?}
  tmp[Write temp file]
  callDA[Call Document AI]
  okDA{OCR success?}
  upload[Upload JSON to Supabase]
  okUp{Upload success?}
  url[Get public URL]
  respond[Return url]
  cleanup[Delete temp file]
  err[Return error]

  start --> recv --> valid
  valid -- no --> err
  valid -- yes --> tmp --> callDA --> okDA
  okDA -- no --> cleanup --> err
  okDA -- yes --> upload --> okUp
  okUp -- no --> cleanup --> err
  okUp -- yes --> url --> respond --> cleanup --> stop([End])
```

### Process: get_summary

```mermaid
flowchart TB
  start([Start])
  in[Input file_path]
  norm[Normalize path]
  dl[Download OCR JSON from Supabase]
  okDL{Download ok?}
  par[[Start RAG setup in parallel]]
  subgraph RAG
    chunk[Create chunks]
    embed[Embed chunks]
    upsert[Upsert to Vertex Vector Search]
  end
  summarize[Summarize with Gemini]
  respond[Return summary]
  err[Return error]

  start --> in --> norm --> dl --> okDL
  okDL -- no --> err
  okDL -- yes --> par
  par --> chunk --> embed --> upsert --> summarize --> respond --> stop([End])
```

### Process: ask

```mermaid
flowchart TB
  start([Start])
  in[Input question and file_path]
  validate{Valid question and path?}
  load[Load OCR chunks]
  embedQ[Embed question]
  search[find_neighbors in Vertex with filter document_id]
  haveRes{Results found?}
  select[Select and post filter context]
  fallback{Enough context?}
  relax[Relax filters and add more]
  prompt[Build prompt]
  gen[Generate answer with Gemini]
  respond[Return response]
  err[Return error]

  start --> in --> validate
  validate -- no --> err
  validate -- yes --> load --> embedQ --> search --> haveRes
  haveRes -- no --> err
  haveRes -- yes --> select --> fallback
  fallback -- no --> prompt --> gen --> respond --> stop([End])
  fallback -- yes --> relax --> prompt
```

### Process: get_risk

```mermaid
flowchart TB
  start([Start])
  in[Input file_path]
  norm[Normalize path]
  dl[Download OCR JSON]
  okDL{Download ok?}
  text[Extract text]
  empty{Text present?}
  prompt[Prompt Gemini for risks]
  parse[Parse JSON result]
  clean[Sanitize items]
  respond[Return risk_statment array]
  err[Return error]

  start --> in --> norm --> dl --> okDL
  okDL -- no --> err
  okDL -- yes --> text --> empty
  empty -- no --> respond
  empty -- yes --> prompt --> parse --> clean --> respond --> stop([End])
```

## Actors and components

- User: interacts via web UI
- Frontend: React and Vite app, routes for login, signup, upload, review
- Backend: FastAPI with endpoints
  - POST /get_ocr
  - POST /get_summary
  - POST /ask
  - POST /get_risk
- External services
  - Google Document AI for OCR
  - Vertex AI Text Embeddings and Matching Engine for vector search
  - Gemini for summarization, Q and A, and risk extraction
  - Supabase Storage for OCR JSON
