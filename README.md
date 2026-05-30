# 🧠 Enterprise RAG Document Q&A System

> **A production-grade Retrieval-Augmented Generation (RAG) web application** where users upload PDFs, DOCX, or TXT documents and ask natural language questions. The system retrieves relevant chunks using hybrid vector + keyword search, re-ranks results, and feeds them to an LLM (Groq Llama 3.3 70B) with full source attribution via SSE streaming.

---

## 📋 Table of Contents

1. [Project Overview](#-project-overview)
2. [Tech Stack](#-tech-stack)
3. [System Architecture](#-system-architecture)
4. [Project Structure](#-project-structure)
5. [File-by-File Breakdown](#-file-by-file-breakdown)
   - [Backend](#backend)
   - [Frontend](#frontend)
   - [Configuration & Root](#configuration--root)
6. [Prerequisites](#-prerequisites)
7. [Setup & Installation](#-setup--installation)
   - [Local Development (Backend)](#local-development-backend)
   - [Local Development (Frontend)](#local-development-frontend)
   - [Docker (Optional)](#docker-optional)
8. [Environment Variables](#-environment-variables)
9. [API Endpoints](#-api-endpoints)
10. [Features](#-features)
11. [Retrieval Strategy](#-retrieval-strategy)
12. [Chunking Strategy](#-chunking-strategy)
13. [Document Ingestion Pipeline](#-document-ingestion-pipeline)
14. [Security & Authentication](#-security--authentication)
15. [Evaluation & Quality Metrics](#-evaluation--quality-metrics)
16. [Key Design Decisions vs ARCHITECTURE.md](#-key-design-decisions-vs-architecturemd)
17. [Development Roadmap](#-development-roadmap)
18. [License](#-license)

---

## 🎯 Project Overview

This system allows users to:

- **Upload documents** (PDF, DOCX, TXT) via a drag-and-drop interface
- **Ask questions** about the uploaded documents in natural language
- **Receive answers** with token-by-token streaming via Server-Sent Events (SSE)
- **View source citations** with page numbers and relevance scores
- **Manage conversations** with full history and search
- **Filter queries** to specific documents for targeted retrieval

### Core Pipeline

```
User Query → History-Aware Rewriting → Hybrid Retrieval (Dense + Sparse)
  → RRF Fusion → Re-Ranking → Context Stuffing → LLM Generation
  → SSE Stream → Source Attribution
```

---

## 🛠 Tech Stack

### Backend
| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | **FastAPI** | 0.115+ |
| Language | **Python** | 3.11+ |
| ASGI Server | **Uvicorn** + **Gunicorn** | latest |
| Validation | **Pydantic v2** | 2.9+ |
| ORM | **SQLAlchemy 2.0** (async) | 2.0+ |
| Database Driver | **asyncpg** | 0.30+ |
| Auth | **python-jose** + **passlib** (bcrypt) | latest |
| Rate Limiting | **slowapi** | 0.1+ |
| File Uploads | **python-multipart** + **aiofiles** | latest |
| Migrations | **Alembic** | 1.14+ |
| Streaming | **SSE** (native FastAPI) | — |
| Logging | **Loguru** | 0.7+ |

### AI / ML Layer
| Layer | Technology | Model / Provider |
|-------|-----------|-----------------|
| LLM | **Groq API** | `llama-3.3-70b-versatile` |
| Embeddings | **HuggingFace** (`sentence-transformers`) | `BAAI/bge-small-en-v1.5` (384d) |
| RAG Orchestration | **LangChain** | 0.3+ |
| Document Parsing | **LlamaParse** / **Unstructured** / **python-docx** | — |
| Vector Search | **Qdrant** (hybrid dense + sparse) | 1.12+ |
| BM25 Sparse | **rank-bm25** | 0.2+ |
| Re-Ranking | **RRF Fusion** (cross-encoder disabled) | — |

### Frontend
| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | **React** | 18+ |
| Language | **TypeScript** | 5.6+ |
| Build Tool | **Vite** | 6+ |
| Styling | **Tailwind CSS** | 3.4+ |
| State Management | **Zustand** | 5+ |
| Markdown | **react-markdown** + **remark-gfm** + **rehype-highlight** | latest |
| Icons | **Lucide React** | 0.468+ |
| HTTP Client | **Axios** | 1.7+ |
| File Upload | **react-dropzone** | 14+ |
| CSS Utility | **clsx** | 2+ |

### Infrastructure
| Layer | Technology |
|-------|-----------|
| Containerization | **Docker** (multi-stage build) |
| Reverse Proxy | **Nginx** (production, config TBD) |
| Vector DB | **Qdrant** (local file-based or cloud) |
| Relational DB | **PostgreSQL** (local or cloud) |

---

## 🏗 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Vite + React)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐ │
│  │ Sidebar  │  │ Chat     │  │ Message  │  │ Source Panel   │ │
│  │ (docs +  │  │ Interface│  │ List +   │  │ (citations +   │ │
│  │ threads) │  │          │  │ Bubbles  │  │ page refs)     │ │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────┘ │
│                       │  SSE Stream (POST /chat)               │
└───────────────────────┼─────────────────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────────────────┐
│                 BACKEND (FastAPI + Uvicorn)                     │
│  ┌──────────┐  ┌──────┴──────┐  ┌──────────┐  ┌─────────────┐ │
│  │ Auth     │  │ Chat Router │  │ Document │  │ Health      │ │
│  │ Router   │  │ (SSE Stream)│  │ Router   │  │ Check       │ │
│  └────┬─────┘  └──────┬──────┘  └────┬─────┘  └──────┬──────┘ │
│       │               │              │                │        │
│  ┌────┴────────────────┴──────────────┴────────────────┴──────┐│
│  │                     SERVICES LAYER                          ││
│  │  ┌──────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  ││
│  │  │ RAGPipeline  │ │ Vector   │ │ Embedding│ │ LLM      │  ││
│  │  │ (orchestrator)│ │ Service  │ │ Service  │ │ Service  │  ││
│  │  └──────────────┘ └──────────┘ └──────────┘ └──────────┘  ││
│  │  ┌──────────────┐ ┌──────────┐ ┌──────────────────────┐   ││
│  │  │ Document     │ │ Chunking │ │ Parser Service        │   ││
│  │  │ Ingestion    │ │ Service  │ │ (PDF/DOCX/TXT)        │   ││
│  │  └──────────────┘ └──────────┘ └──────────────────────┘   ││
│  └────────────────────────────────────────────────────────────┘│
│                        │                                      │
│  ┌─────────────────────┴──────────────────────────────────┐    │
│  │              DATA LAYER                                 │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │    │
│  │  │  PostgreSQL   │  │    Qdrant    │  │  Filesystem  │ │    │
│  │  │  (users, docs,│  │  (vectors +  │  │  (uploads/   │ │    │
│  │  │  chats, msgs) │  │  payload)    │  │   storage)   │ │    │
│  │  └──────────────┘  └──────────────┘  └──────────────┘ │    │
│  └────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
rag/
├── README.md                    # This file
├── ARCHITECTURE.md              # Detailed architecture specification document
├── .gitignore                   # Git ignore rules
├── backend/.env.example          # Example environment variables template
│
├── backend/                     # Python FastAPI back-end
│   ├── requirements.txt         # Python dependencies
│   ├── alembic.ini              # Alembic migration config
│   ├── alembic/                 # Database migrations
│   │   ├── env.py               # Alembic environment config (async)
│   │   └── versions/            # Migration versions directory
│   │       └── .gitkeep         # Placeholder to keep dir in git
│   │
│   └── app/                     # Main application package
│       ├── __init__.py          # Package marker
│       ├── main.py              # App factory, lifespan, CORS, routers
│       ├── config.py            # Pydantic Settings (env vars)
│       ├── database.py          # Async SQLAlchemy engine + session
│       ├── models.py            # ORM models (User, Document, Conversation, Message)
│       ├── schemas.py           # Pydantic request/response schemas
│       ├── auth.py              # JWT create/decode, password hashing
│       ├── dependencies.py      # FastAPI deps (get_db, get_current_user)
│       │
│       ├── routers/             # API route handlers
│       │   ├── __init__.py      # Package marker
│       │   ├── auth.py          # POST /auth/register, /login, /refresh
│       │   ├── chat.py          # POST /chat (SSE stream), GET/DELETE conversations
│       │   └── documents.py     # POST /documents/upload, GET/DELETE documents
│       │
│       ├── services/            # Business logic layer
│       │   ├── __init__.py      # Package marker
│       │   ├── rag_service.py   # RAG pipeline orchestrator
│       │   ├── vector_service.py # Qdrant hybrid search + RRF fusion
│       │   ├── embedding_service.py # BGE embedding model (singleton)
│       │   ├── llm_service.py   # Groq API wrapper (direct SDK)
│       │   ├── document_service.py # Ingestion pipeline orchestrator
│       │   ├── parser_service.py   # Document parsers (PDF/DOCX/TXT)
│       │   └── chunking_service.py # Semantic + layout-aware chunking
│       │
│       └── prompts/             # Prompt templates
│           └── rag_prompt.txt   # RAG system prompt template
│
└── frontend/                    # React + TypeScript + Vite front-end
    ├── Dockerfile               # Multi-stage Docker build
    ├── package.json             # Node dependencies
    ├── tsconfig.json            # TypeScript config
    ├── vite.config.ts           # Vite config with API proxy
    ├── tailwind.config.js       # Tailwind CSS theme
    ├── postcss.config.js        # PostCSS config
    ├── index.html               # Entry HTML
    │
    └── src/
        ├── main.tsx             # React entry point
        ├── App.tsx              # Root component (auth/login + chat)
        ├── index.css            # Tailwind + glassmorphic styles
        │
        ├── types/
        │   └── index.ts         # TypeScript interfaces & types
        │
        ├── api/
        │   └── client.ts        # Axios instance + JWT interceptors
        │
        ├── stores/
        │   └── chatStore.ts     # Zustand global state
        │
        ├── hooks/
        │   ├── useChat.ts       # SSE streaming hook
        │   └── useDocuments.ts  # Document CRUD + polling
        │
        └── components/
            ├── ChatInterface.tsx    # Main chat layout
            ├── Sidebar.tsx          # Document list + chat history
            ├── MessageList.tsx      # Scrollable message list
            ├── MessageBubble.tsx    # User/assistant message card
            ├── MarkdownRenderer.tsx # Markdown + syntax highlighting
            ├── SourcePanel.tsx      # Source citation drawer
            └── FileUploadZone.tsx   # Drag-and-drop upload zone
```

---

## 📄 File-by-File Breakdown

### Backend

#### Configuration & Entry Points

| File | Purpose |
|------|---------|
| `backend/requirements.txt` | All Python dependencies organized by category (core, db, auth, AI/ML, dev). Uses CPU-only PyTorch index. 50+ packages. |
| `backend/alembic.ini` | Alembic migration configuration. Points to `alembic/` scripts. Default DB URL set for Docker PostgreSQL. |
| `backend/alembic/env.py` | Async Alembic environment. Imports all models from `app.models` for auto-detection. Dynamically reads DB URL from app settings. |
| `backend/alembic/versions/.gitkeep` | Placeholder to keep the empty `versions/` directory in version control. |

#### Application Core (`backend/app/`)

| File | Purpose |
|------|---------|
| `__init__.py` | Package marker — empty. |
| `main.py` | **FastAPI app factory.** Configures CORS, rate limiter (slowapi), global exception handler, health check endpoint (`GET /health`), LangSmith tracing, and registers all routers. |
| `config.py` | **Pydantic v2 Settings** — loads from `.env` / environment. Includes: API keys (Groq, LlamaParse, LangChain), DB URLs, JWT config, Qdrant config, embedding model names, upload limits, CORS origins. |
| `database.py` | **Async SQLAlchemy engine** (asyncpg). Creates `async_session_factory`, `Base` declarative class, `get_db()` dependency, and `init_db()` for dev table creation. |
| `models.py` | **4 ORM models:** `User` (id, email, hashed_password), `Document` (filename, status, chunk_count, page_count), `Converation` (title, user relationship), `Message` (role: user/assistant/system, content, sources_json). All use UUID primary keys. |
| `schemas.py` | **Pydantic v2 schemas** for all endpoints: auth (register, login, token, refresh), documents (response, list), chat (request, message, conversation, source chunks), SSE events (token, sources, error, done), health, and error responses. |
| `auth.py` | **JWT utilities:** `hash_password()` (bcrypt, work factor 12), `verify_password()`, `create_access_token()` (15 min), `create_refresh_token()` (7 days), `decode_token()`. Uses python-jose. |
| `dependencies.py` | **FastAPI dependencies:** `get_db()` (async session), `get_current_user()` (extracts user from Bearer JWT, validates token type and user existence). |

#### Routers (`backend/app/routers/`)

| File | Purpose |
|------|---------|
| `auth.py` | **3 endpoints:** `POST /auth/register` (create user, 201), `POST /auth/login` (returns access+refresh tokens), `POST /auth/refresh` (rotate tokens). All rate-limited to 10/min. |
| `chat.py` | **4 endpoints:** `POST /chat` (SSE streaming — creates/gets conversation, validates docs, streams RAG answer), `GET /chat/conversations` (list), `GET /chat/history/{id}` (full thread), `DELETE /chat/{id}`. Saves assistant messages after streaming completes. |
| `documents.py` | **4 endpoints:** `POST /documents/upload` (validates type/size, saves to disk, creates DB record, triggers async background ingestion), `GET /documents` (list user's docs), `GET /documents/{id}` (detail), `DELETE /documents/{id}` (removes from Qdrant + filesystem + DB). |

#### Services (`backend/app/services/`)

| File | Purpose |
|------|---------|
| `rag_service.py` | **RAG pipeline orchestrator.** 3-step flow: (1) History-aware query rewriting via LLM, (2) Hybrid retrieval → RRF fusion → re-rank (top 4), (3) Build context prompt → Stream LLM response → Emit sources. Yields SSE-compatible dicts. |
| `vector_service.py` | **Qdrant operations.** Creates collection with dense (384d, Cosine) + sparse (BM25) vectors. Payload indices for filtering (document_id, user_id, page_number, etc.). Methods: `upsert_chunks()`, `search()` (hybrid dense+sparse with RRF fusion, k=60), `rerank()` (sorted by RRF score), `delete_document_vectors()`. Supports local file-based or remote Qdrant. |
| `embedding_service.py` | **Singleton embedding model** (BAAI/bge-small-en-v1.5, 384 dimensions). Lazy-loads on first use. Batch processes (32 at a time). `embed_texts()` for documents, `embed_query()` for search. Fixes PyTorch OpenMP collision on Windows (`KMP_DUPLICATE_LIB_OK=TRUE`). |
| `llm_service.py` | **Groq API wrapper.** Uses `groq.AsyncGroq` directly (not langchain-groq) to avoid asyncio bugs. `agenerate()` for non-streaming, `astream()` for streaming. Converts LangChain message objects to plain dicts. |
| `document_service.py` | **Ingestion pipeline orchestrator.** Sequential steps: Parse → Chunk → Embed → Upsert to Qdrant → Update DB status. Updates document status at each stage. Handles failures and marks as "failed" with error message. |
| `parser_service.py` | **Multi-strategy document parser.** Priority: (1) LlamaParse for PDFs (if API key set), (2) Unstructured (PDF), (3) python-docx (DOCX), (4) plain text (TXT). Returns `ParsedElement` list with text, type (text/table/title/header), page number, section title. |
| `chunking_service.py` | **Semantic chunking with layout-aware boundaries.** Tables are atomic (never split). Titles/headers start new boundaries. Falls back to RecursiveCharacterTextSplitter if SemanticChunker unavailable. Builds page/section mapping for each chunk. |

#### Prompts

| File | Purpose |
|------|---------|
| `backend/app/prompts/rag_prompt.txt` | RAG prompt template with placeholders for `{chat_history}`, `{context}`, `{input}`. Instructs LLM to cite sources in `[Source: Page X]` format. |

### Frontend

#### Configuration

| File | Purpose |
|------|---------|
| `frontend/package.json` | NPM config with 11 production dependencies (React 18, zustand, axios, react-markdown, lucide-react, react-dropzone, etc.) and 7 dev dependencies (Vite 6, TypeScript 5.6, Tailwind 3.4, etc.). |
| `frontend/tsconfig.json` | TypeScript strict mode config. Target ES2020. Bundler module resolution. No unused locals/params. |
| `frontend/vite.config.ts` | Vite config with React plugin. Dev server on port 5173. Proxies `/auth`, `/documents`, `/chat`, `/health` to backend at `localhost:8000`. |
| `frontend/tailwind.config.js` | Tailwind with dark mode (`class`), custom colors (primary blue, dark slate), animations (fade-in, slide-up, pulse-dot). |
| `frontend/postcss.config.js` | PostCSS with Tailwind + Autoprefixer. |
| `frontend/index.html` | Entry HTML with Google Fonts (Inter + Outfit). Title: "Enterprise RAG Document Q&A System". |

#### Source Code (`frontend/src/`)

| File | Purpose |
|------|---------|
| `main.tsx` | React entry point. Renders `<App>` in StrictMode. |
| `App.tsx` | **Root component.** Manages auth state: login/register form with email + password. JWT decode for user info. Stores tokens in localStorage. Listens to `auth-logout`, `auth-refreshing`, `auth-refreshed`, `auth-refresh-failed` events. On auth success, renders `<ChatInterface>`. |
| `index.css` | Tailwind imports + glassmorphic utilities (`.glass-panel`, `.glass-card`, `.glass-input`), custom scrollbar, animations (float, pulse-subtle, stream-in, shimmer). |
| `types/index.ts` | **TypeScript interfaces:** `User`, `Document` (with status enum), `SourceChunk`, `ChatMessage`, `Conversation`, API response types, SSE event union type. |
| `api/client.ts` | **Axios instance** with JWT request interceptor (attaches Bearer token) and response interceptor (handles 401 → token refresh → retry queue, dispatches auth events). |
| `stores/chatStore.ts` | **Zustand store** with state for: user, tokens, conversations, documents, selected document IDs, streaming status, auth refreshing. Actions for auth, messages (add, update streaming, finalize), document selection. |
| `hooks/useChat.ts` | **Chat hook** — sends messages via POST /chat, reads SSE stream with `ReadableStream` reader, parses token/sources/error/done events, calls Zustand actions. |
| `hooks/useDocuments.ts` | **Document hook** — CRUD operations, upload progress tracking, auto-polls every 3s when documents are processing. |
| `components/ChatInterface.tsx` | Main chat layout with header (title, streaming indicator, filter tags), messages feed, input bar (textarea with send button, context filter indicators, error alerts). |
| `components/Sidebar.tsx` | Left panel with: brand logo, file upload zone, knowledge collection (documents with status indicators, selection checkboxes, delete), chat history (search, list, delete), user profile dock (session status, logout). |
| `components/MessageList.tsx` | Scrollable message container. Empty state with welcome card and suggested queries. Auto-scrolls to bottom on new messages. |
| `components/MessageBubble.tsx` | Individual message card — user messages gradient right-aligned, assistant messages glass-panel left-aligned with avatar icons. Shows shimmer loading animation for streaming. Citation badges for sources. |
| `components/MarkdownRenderer.tsx` | Markdown rendering with react-markdown, GFM tables, syntax highlighting. Custom styling for all elements (headings, lists, tables, code blocks, inline code). |
| `components/SourcePanel.tsx` | Slide-in drawer from right showing source citations. Displays filename, page number, relevance score (formatted as percentage), section title, and source text snippet. Active page highlighted. |
| `components/FileUploadZone.tsx` | Drag-and-drop upload zone using react-dropzone. Shows upload progress bar, processing animation, error messages. Accepts PDF/DOCX/TXT up to 50MB. |

### Configuration & Root

| File | Purpose |
|------|---------|
| `README.md` | **This file** — comprehensive project documentation. |
| `ARCHITECTURE.md` | Detailed architecture specification covering tech stack, retrieval strategy, chunking, re-ranking, RAG phases, deployment, etc. Contains some aspirational/outdated references. |
| `.gitignore` | Git ignore rules. |
| `frontend/Dockerfile` | Multi-stage Docker build: dev stage (Node 20, runs vite dev), build stage (compiles TS), production stage (Nginx serving static files — requires a separate `nginx.conf`). |

---

## ✅ Prerequisites

- **Python** 3.11+
- **Node.js** 20+
- **PostgreSQL** 15+ (local or cloud)
- **Groq API key** (free at [console.groq.com](https://console.groq.com))
- **Qdrant** (local file-based — no server needed, or cloud at [cloud.qdrant.io](https://cloud.qdrant.io))
- **Optional:** LlamaParse API key (free 2,000 pages/day at [cloud.llamaindex.ai](https://cloud.llamaindex.ai))
- **Optional:** LangSmith API key for tracing ([smith.langchain.com](https://smith.langchain.com))

---

## 🔧 Setup & Installation

### Local Development (Backend)

```bash
# 1. Clone and navigate to backend
cd rag/backend

# 2. Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# or: .venv\Scripts\activate  # Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Create .env file (copy from .env.example below)
# Minimum required:
#   GROQ_API_KEY=your_groq_api_key
#   DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/ragdb
#   JWT_SECRET_KEY=your_random_64_char_string

# 5. Ensure PostgreSQL is running and database exists
createdb ragdb

# 6. Run database migrations
alembic upgrade head

# 7. Start the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`. Interactive docs at `http://localhost:8000/docs`.

### Local Development (Frontend)

```bash
# 1. Navigate to frontend
cd rag/frontend

# 2. Install dependencies
npm install

# 3. Start dev server (with API proxy to localhost:8000)
npm run dev
```

The frontend will be available at `http://localhost:5173`.

### Docker (Optional)

> **Note:** The Dockerfile builds the frontend, but a full Docker Compose setup for all services (backend, PostgreSQL, Qdrant) is not included yet.

```bash
cd rag/frontend
docker build -t rag-frontend .
docker run -p 5173:5173 rag-frontend
```

---

## 🔐 Environment Variables

Create a `.env` file in the `backend/` directory with the following:

```bash
# === REQUIRED ===
GROQ_API_KEY=gsk_your_groq_api_key_here
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/ragdb
JWT_SECRET_KEY=change_me_to_a_random_64_char_string

# === DATABASE (overrides DATABASE_URL) ===
POSTGRES_USER=postgres
POSTGRES_PASSWORD=ragpass
POSTGRES_DB=ragdb

# === VECTOR DB (optional — uses local file-based if empty) ===
QDRANT_URL=
QDRANT_API_KEY=

# === OPTIONAL ===
LLAMAPARSE_API_KEY=llx_optional
LANGCHAIN_API_KEY=lsv2_optional
LANGCHAIN_TRACING_V2=false
LANGCHAIN_PROJECT=rag-document-qa

# === AUTH SETTINGS ===
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# === APP SETTINGS ===
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=50
MAX_UPLOADS_PER_USER=10
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# === EMBEDDING ===
EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
EMBEDDING_DEVICE=cpu

# === LLM ===
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_TEMPERATURE=0.1
GROQ_MAX_TOKENS=2048
```

---

## 🌐 API Endpoints

| Method | Path | Auth | Rate Limit | Description |
|--------|------|------|------------|-------------|
| `GET` | `/health` | No | — | Health check (PostgreSQL + Qdrant) |
| `POST` | `/auth/register` | No | 10/min | Create account |
| `POST` | `/auth/login` | No | 10/min | Sign in (returns JWT tokens) |
| `POST` | `/auth/refresh` | No | 10/min | Rotate expired token |
| `POST` | `/documents/upload` | JWT | 10/min | Upload PDF/DOCX/TXT |
| `GET` | `/documents` | JWT | — | List user's documents |
| `GET` | `/documents/{id}` | JWT | — | Get document details |
| `DELETE` | `/documents/{id}` | JWT | — | Delete document + vectors |
| `POST` | `/chat` | JWT | 10/min | Ask question (SSE stream) |
| `GET` | `/chat/conversations` | JWT | — | List conversations |
| `GET` | `/chat/history/{id}` | JWT | — | Get conversation messages |
| `DELETE` | `/chat/{id}` | JWT | — | Delete conversation |

### SSE Event Stream (POST /chat)

The `/chat` endpoint returns Server-Sent Events in the following format:

```
data: {"type": "token", "content": "The answer is..."}

data: {"type": "sources", "data": [{"text": "...", "page_number": 1, ...}]}

data: {"type": "done", "conversation_id": "uuid-here"}
```

---

## ✨ Features

### Current (Phase 1)
- ✅ **Multi-format upload:** PDF, DOCX, TXT (up to 50MB)
- ✅ **Hybrid retrieval:** Dense (BGE embeddings) + Sparse (BM25) with RRF fusion
- ✅ **Semantic chunking:** Layout-aware, table-preserving, header-bounded
- ✅ **SSE streaming:** Token-by-token answer delivery
- ✅ **Source attribution:** Clickable badges with page numbers and relevance scores
- ✅ **Conversation management:** History, search, delete threads
- ✅ **JWT authentication:** Register, login, token refresh
- ✅ **Rate limiting:** 10 requests/minute per endpoint
- ✅ **Multi-tenancy:** User-scoped document isolation
- ✅ **Document filtering:** Query specific documents
- ✅ **History-aware rewriting:** LLM rewrites follow-up questions as standalone queries
- ✅ **Background ingestion:** Async document processing with status polling
- ✅ **Dark UI:** Premium glassmorphic design with Tailwind

### Planned (Phase 2+)
- ⬜ **Agentic RAG:** ReActAgent with per-document query tools
- ⬜ **Multi-document cross-referencing:** Answer from multiple indexed sources
- ⬜ **RAGAS evaluation pipeline:** Automated faithfulness/relevancy scoring
- ⬜ **LangSmith tracing:** Full observability
- ⬜ **PDF preview:** In-browser PDF viewer at cited pages
- ⬜ **Docker Compose:** Full multi-service orchestration
- ⬜ **Nginx config:** Production reverse proxy

---

## 🔍 Retrieval Strategy

### Hybrid Dense + Sparse with RRF Fusion

| Component | Details |
|-----------|---------|
| **Dense Model** | `BAAI/bge-small-en-v1.5` (384 dimensions) |
| **Sparse Model** | BM25 token frequencies (inverted index) |
| **Top-K (each)** | 10 |
| **Fusion** | Reciprocal Rank Fusion (k=60) |
| **Final Top-K** | 10 (before re-ranking) → 4 (after re-ranking) |
| **Re-ranking** | RRF score sorting (cross-encoder disabled) |
| **Multi-tenancy** | Filtered by `user_id` on every query |

### Why Hybrid?
Basic similarity search misses exact keywords, dates, numbers, and acronyms. Hybrid combines semantic understanding (dense vectors) with exact keyword matching (BM25 sparse vectors), then fuses results using RRF.

---

## 📝 Chunking Strategy

### Semantic + Layout-Aware

| Aspect | Approach |
|--------|----------|
| **Primary** | Semantic splitting (embedding-based) |
| **Fallback** | Recursive character splitting (800 chars, 150 overlap) |
| **Tables** | Kept as atomic chunks — never split |
| **Headers** | Start new chunk boundaries |
| **Page metadata** | Preserved per chunk |
| **Section titles** | Extracted from nearest header |

---

## ⚙️ Document Ingestion Pipeline

```
Upload (FastAPI) → Background Task → Parse (LlamaParse/Unstructured/DOCX/TXT)
  → Chunk (Semantic + Layout-Aware) → Embed (BGE, batch 32)
  → Upsert to Qdrant (Dense + Sparse + Payload)
  → Update DB Status (processing → parsing → chunking → embedding → indexed/failed)
```

Status is tracked via document `status` field:
`uploading → processing → parsing → chunking → embedding → indexed` (or `failed`)

Frontend polls every 3 seconds while any document has a non-terminal status.

---

## 🔒 Security & Authentication

- **JWT tokens:** Access token (15 min) + Refresh token (7 days)
- **Password hashing:** bcrypt with work factor 12
- **Rate limiting:** slowapi (10 requests/minute per IP)
- **Data isolation:** All Qdrant queries filtered by `user_id`
- **File validation:** Whitelist extensions (.pdf, .docx, .txt), max 50MB
- **Token refresh:** Automatic silent refresh via Axios interceptor with request queuing
- **Global exception handler:** Catches unhandled errors, returns safe responses

---

## 📊 Evaluation & Quality Metrics

| Metric | Tool | Target |
|--------|------|--------|
| Faithfulness | RAGAS | > 0.75 |
| Answer Relevancy | RAGAS | > 0.80 |
| Context Precision | RAGAS | > 0.85 |
| Context Recall | RAGAS | > 0.70 |

**Note:** RAGAS is listed in `requirements.txt` but evaluation pipeline is not yet implemented.

---

## ⚠️ Key Design Decisions vs ARCHITECTURE.md

The `ARCHITECTURE.md` file is an aspirational design document. The actual implementation differs in several areas:

| Aspect | ARCHITECTURE.md | Actual Implementation |
|--------|----------------|----------------------|
| Embedding Model | `BAAI/bge-large-en-v1.5` (1024d) | `BAAI/bge-small-en-v1.5` (384d) |
| Re-ranking | Cross-encoder (`BAAI/bge-reranker-large`) | RRF score sorting only |
| Background Jobs | Celery + Redis | FastAPI BackgroundTasks |
| UI Components | shadcn/ui | Custom Tailwind components |
| Streaming | Vercel AI SDK | Raw `ReadableStream` SSE reader |
| PDF Preview | react-pdf | Not implemented |
| Ollama Fallback | qwen2.5:14b / llama3.1:8b | Not implemented |
| Docker Compose | Full orchestration | Frontend Dockerfile only |
| CI/CD | GitHub Actions | Not implemented |

These simplifications were made to reduce dependencies, keep the stack lean, and focus on core RAG functionality.

---

## 🗺 Development Roadmap

### Current Status: **Phase 1 Complete**

### Phase 1: Core RAG ✅
- ✅ FastAPI scaffold + routers
- ✅ React frontend with chat UI + auth
- ✅ Multi-format document upload (PDF/DOCX/TXT)
- ✅ Hybrid retrieval with Qdrant (dense + sparse)
- ✅ Semantic chunking + layout-aware boundaries
- ✅ RRF fusion re-ranking
- ✅ Groq API integration with SSE streaming
- ✅ Source attribution with citation badges
- ✅ JWT auth + rate limiting
- ✅ Conversation memory with history-aware rewriting
- ✅ Dark premium UI with glassmorphism

### Phase 2: Production Polish
- [ ] Cross-encoder re-ranker integration
- [ ] RAGAS evaluation pipeline
- [ ] LangSmith tracing
- [ ] PDF preview in source panel
- [ ] Docker Compose for all services
- [ ] Production Nginx config
- [ ] `.env.example` file creation

### Phase 3: Advanced Features
- [ ] Agentic RAG with ReActAgent
- [ ] Multi-document cross-referencing
- [ ] Image extraction + vision model
- [ ] Guardrails for prompt injection
- [ ] WebSocket for real-time status updates

---

## 📝 License

This project is for demonstration and educational purposes.

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

*README generated on May 30, 2026 — for the most up-to-date information, refer to source code and inline documentation.*
