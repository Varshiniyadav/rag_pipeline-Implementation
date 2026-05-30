"""
Documents router — upload, list, delete documents.
Uploads trigger async Celery tasks for ingestion.
"""

import os
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, status, BackgroundTasks
from loguru import logger
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.dependencies import get_current_user, get_db
from app.models import Document, User
from app.schemas import DocumentListResponse, DocumentResponse

router = APIRouter(prefix="/documents", tags=["Documents"])
limiter = Limiter(key_func=get_remote_address)
settings = get_settings()

# Allowed MIME types
ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "text/plain": ".txt",
}

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}


def _validate_file(file: UploadFile) -> str:
    """Validate file type and size. Returns the file extension."""
    # Check extension
    if file.filename:
        ext = Path(file.filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File type '{ext}' not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is required.",
        )

    # Check content type
    if file.content_type and file.content_type not in ALLOWED_TYPES:
        # Be lenient — some systems send wrong content types
        logger.warning(f"Unexpected content type '{file.content_type}' for file '{file.filename}'")

    return ext


@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """Upload a document (PDF, DOCX, TXT). Triggers async ingestion."""
    ext = _validate_file(file)

    # Check upload limit
    count_result = await db.execute(
        select(func.count(Document.id)).where(Document.user_id == current_user.id)
    )
    doc_count = count_result.scalar() or 0
    if doc_count >= settings.max_uploads_per_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum upload limit reached ({settings.max_uploads_per_user} documents).",
        )

    # Read and check size
    content = await file.read()
    if len(content) > settings.max_file_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size exceeds maximum of {settings.max_file_size_mb}MB.",
        )

    # Generate unique filename and save
    doc_id = uuid.uuid4()
    user_dir = Path(settings.upload_dir) / str(current_user.id) / str(doc_id)
    user_dir.mkdir(parents=True, exist_ok=True)

    safe_filename = f"{doc_id}{ext}"
    file_path = user_dir / safe_filename

    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    # Create database record
    document = Document(
        id=doc_id,
        user_id=current_user.id,
        filename=safe_filename,
        original_filename=file.filename,
        file_path=str(file_path),
        file_size=len(content),
        mime_type=file.content_type or "application/octet-stream",
        status="processing",
    )
    db.add(document)
    # Commit immediately to release database locks and allow external updates without deadlocking
    await db.commit()

    # Process ingestion asynchronously using FastAPI BackgroundTasks
    async def _process_document(doc_id_str: str, file_path_str: str, user_id_str: str):
        """Async background task — FastAPI awaits this in the same event loop.
        DocumentIngestionService.process() handles ALL status transitions internally:
          processing → parsing → chunking → embedding → indexed  (or failed)
        So we only need a safety net here for unexpected crashes.
        """
        from app.services.document_service import DocumentIngestionService
        try:
            ingestion_service = DocumentIngestionService()
            await ingestion_service.process(doc_id_str, file_path_str, user_id_str)
            logger.info(f"📄 Document ingested successfully: {doc_id_str}")
        except Exception as e:
            # document_service already marks it failed internally; log here for visibility
            logger.error(f"Background ingestion crashed for {doc_id_str}: {e}", exc_info=True)

    background_tasks.add_task(_process_document, str(doc_id), str(file_path), str(current_user.id))
    # Return the document record immediately; ingestion will update status later.
    return document

@router.get("", response_model=DocumentListResponse)
async def list_documents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all documents uploaded by the current user."""
    result = await db.execute(
        select(Document)
        .where(Document.user_id == current_user.id)
        .order_by(Document.created_at.desc())
    )
    docs = result.scalars().all()
    return DocumentListResponse(documents=docs, total=len(docs))


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a specific document's details."""
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.user_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return doc


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    document_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a document — removes from DB, Qdrant, and filesystem."""
    result = await db.execute(
        select(Document).where(
            Document.id == document_id,
            Document.user_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    # Delete from Qdrant
    try:
        from app.services.vector_service import VectorService
        vector_svc = VectorService()
        await vector_svc.delete_document_vectors(str(document_id))
        logger.info(f"Deleted vectors for document {document_id}")
    except Exception as e:
        logger.error(f"Failed to delete vectors: {e}")

    # Delete files from filesystem
    try:
        import shutil
        doc_dir = Path(doc.file_path).parent
        if doc_dir.exists():
            shutil.rmtree(doc_dir)
            logger.info(f"Deleted files for document {document_id}")
    except Exception as e:
        logger.error(f"Failed to delete files: {e}")

    # Delete from database
    await db.delete(doc)
    await db.commit()
    logger.info(f"🗑️ Document deleted: {doc.original_filename} ({document_id})")
