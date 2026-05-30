"""
FastAPI application factory — CORS, routers, health check, exception handlers.
"""


from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import text

from app.config import get_settings
from app.database import init_db
from app.schemas import ErrorResponse, HealthResponse

settings = get_settings()

# ── Rate Limiter ──────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)


# ── Lifespan ──────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup & shutdown events."""
    logger.info("🚀 Starting RAG Document Q&A API...")

    # Configure LangSmith tracing if available
    if settings.langsmith_available:
        import os
        os.environ["LANGCHAIN_TRACING_V2"] = "true"
        os.environ["LANGCHAIN_API_KEY"] = settings.langchain_api_key
        os.environ["LANGCHAIN_PROJECT"] = settings.langchain_project
        logger.info("📊 LangSmith tracing enabled")

    # Create database tables (dev convenience)
    await init_db()
    logger.info("✅ Database tables initialized")

    # Ensure upload directory exists
    import os
    os.makedirs(settings.upload_dir, exist_ok=True)
    logger.info(f"📁 Upload directory: {settings.upload_dir}")

    yield

    logger.info("👋 Shutting down RAG Document Q&A API...")


# ── App Factory ───────────────────────────────────────────────
def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    application = FastAPI(
        title="RAG Document Q&A API",
        description="Production-grade RAG system with hybrid retrieval, re-ranking, and streaming answers.",
        version="1.0.0",
        lifespan=lifespan,
    )

    # Rate limiter
    application.state.limiter = limiter
    application.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

    # CORS
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Global Exception Handler ─────────────────────────────
    @application.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled exception: {exc}", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ErrorResponse(
                error="Internal Server Error",
                detail=str(exc) if settings.langchain_tracing_v2 else "An unexpected error occurred.",
            ).model_dump(),
        )

    # ── Health Check ─────────────────────────────────────────
    @application.get("/health", response_model=HealthResponse, tags=["Health"])
    async def health_check():
        """Health check endpoint."""
        services = {}

        # Check PostgreSQL
        try:
            from app.database import engine
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            services["postgres"] = "healthy"
        except Exception:
            services["postgres"] = "unhealthy"



        # Check Qdrant
        try:
            from qdrant_client import QdrantClient
            client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)
            client.get_collections()
            client.close()
            services["qdrant"] = "healthy"
        except Exception:
            services["qdrant"] = "unhealthy"

        return HealthResponse(services=services)

    # ── Register Routers ─────────────────────────────────────
    from app.routers import auth, chat, documents
    application.include_router(auth.router)
    application.include_router(documents.router)
    application.include_router(chat.router)

    return application


# Create the app instance
app = create_app()
