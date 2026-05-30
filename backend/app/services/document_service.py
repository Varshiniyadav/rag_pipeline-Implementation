"""
Document ingestion service — orchestrates the full pipeline:
  Parse → Chunk → Embed → Upsert to Qdrant → Update DB status
"""
from loguru import logger
from sqlalchemy import update
from app.database import async_session_factory
from app.models import Document
from app.services.parser_service import ParserService
from app.services.chunking_service import ChunkingService
from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService


class DocumentIngestionService:
    """Orchestrates full document ingestion pipeline."""

    def __init__(self):
        self.parser = ParserService()
        self.chunker = ChunkingService()
        self.embedder = EmbeddingService()
        self.vector_store = VectorService()

    async def _update_status(self, document_id: str, status: str, **kwargs):
        import uuid as _uuid
        async with async_session_factory() as db:
            values = {"status": status, **kwargs}
            await db.execute(
                update(Document).where(Document.id == _uuid.UUID(document_id)).values(**values)
            )
            await db.commit()

    async def process(self, document_id: str, file_path: str, user_id: str) -> dict:
        """Run the full ingestion pipeline."""
        try:
            # Step 1: Parse
            await self._update_status(document_id, "parsing")
            logger.info(f"[{document_id}] Step 1: Parsing...")
            elements = await self.parser.parse(file_path)
            page_count = max((e.page_number for e in elements), default=0)

            # Step 2: Chunk
            await self._update_status(document_id, "chunking")
            logger.info(f"[{document_id}] Step 2: Chunking {len(elements)} elements...")
            from pathlib import Path
            chunks = await self.chunker.chunk(elements, document_id, Path(file_path).name)

            # Add user_id to chunk metadata
            for chunk in chunks:
                chunk.metadata["user_id"] = user_id

            # Step 3: Embed
            await self._update_status(document_id, "embedding")
            logger.info(f"[{document_id}] Step 3: Embedding {len(chunks)} chunks...")
            texts = [c.text for c in chunks]
            embeddings = await self.embedder.embed_texts(texts)

            # Step 4: Upsert to Qdrant
            logger.info(f"[{document_id}] Step 4: Upserting to Qdrant...")
            count = await self.vector_store.upsert_chunks(chunks, embeddings)

            # Step 5: Update status to indexed
            await self._update_status(
                document_id, "indexed",
                chunk_count=len(chunks), page_count=page_count
            )
            logger.info(f"[{document_id}] Ingestion complete: {count} vectors indexed")
            return {"status": "indexed", "chunks": len(chunks), "pages": page_count}

        except Exception as e:
            logger.error(f"[{document_id}] Ingestion failed: {e}", exc_info=True)
            await self._update_status(document_id, "failed", error_message=str(e))
            raise
