"""
Semantic chunking service — splits parsed elements into semantically coherent chunks.
Uses LangChain SemanticChunker with layout-aware boundaries.
Tables are kept as atomic chunks (never split).
"""


from dataclasses import dataclass, field
from typing import List, Optional
from uuid import UUID

from loguru import logger

from app.config import get_settings
from app.services.parser_service import ParsedElement

settings = get_settings()


@dataclass
class DocumentChunk:
    """A single chunk ready for embedding and indexing."""
    text: str
    page_number: int = 0
    section_title: str = ""
    document_id: str = ""
    chunk_index: int = 0
    source_filename: str = ""
    element_type: str = "text"  # "text", "table", "title"
    metadata: dict = field(default_factory=dict)


class ChunkingService:
    """Semantic chunking with layout-aware boundaries."""

    def __init__(self):
        pass

    async def _get_embeddings(self):
        """Reuse the EmbeddingService singleton model — avoids loading a second 1.3GB model."""
        from app.services.embedding_service import EmbeddingService
        return await EmbeddingService()._get_model()

    async def chunk(
        self,
        elements: List[ParsedElement],
        document_id: str,
        source_filename: str,
    ) -> List[DocumentChunk]:
        """
        Split parsed elements into semantically coherent chunks.

        Strategy:
        1. Tables are kept as atomic chunks (never split)
        2. Titles/headers start new chunk boundaries
        3. Text blocks are semantically split
        """
        logger.info(f"Chunking {len(elements)} elements for document {document_id}")

        chunks: List[DocumentChunk] = []
        text_buffer: List[ParsedElement] = []

        for element in elements:
            if element.element_type == "table":
                # Flush any buffered text first
                if text_buffer:
                    text_chunks = await self._semantic_split(text_buffer, document_id, source_filename)
                    chunks.extend(text_chunks)
                    text_buffer = []

                # Table is always an atomic chunk
                chunks.append(DocumentChunk(
                    text=element.text,
                    page_number=element.page_number,
                    section_title=element.section_title,
                    document_id=document_id,
                    source_filename=source_filename,
                    element_type="table",
                ))

            elif element.element_type in ("title", "header"):
                # Flush buffer at section boundaries
                if text_buffer:
                    text_chunks = await self._semantic_split(text_buffer, document_id, source_filename)
                    chunks.extend(text_chunks)
                    text_buffer = []
                text_buffer.append(element)

            else:
                text_buffer.append(element)

        # Flush remaining buffer
        if text_buffer:
            text_chunks = await self._semantic_split(text_buffer, document_id, source_filename)
            chunks.extend(text_chunks)

        # Assign chunk indices
        for i, chunk in enumerate(chunks):
            chunk.chunk_index = i

        logger.info(f"Created {len(chunks)} chunks for document {document_id}")
        return chunks

    async def _semantic_split(
        self,
        elements: List[ParsedElement],
        document_id: str,
        source_filename: str,
    ) -> List[DocumentChunk]:
        """Semantically split a sequence of text elements."""
        import asyncio

        # Combine elements into a single text for semantic splitting
        combined_text = "\n\n".join(elem.text for elem in elements)

        if len(combined_text.strip()) < 100:
            # Too short to split — return as single chunk
            page = elements[0].page_number if elements else 0
            section = elements[0].section_title if elements else ""
            return [DocumentChunk(
                text=combined_text.strip(),
                page_number=page,
                section_title=section,
                document_id=document_id,
                source_filename=source_filename,
                element_type="text",
            )]

        # Await embeddings outside of the sync thread
        embeddings = None
        try:
            import langchain_experimental.text_splitter
            embeddings = await self._get_embeddings()
        except ImportError:
            pass

        def _sync_split():
            try:
                if embeddings is None:
                    raise ImportError("langchain_experimental not installed")
                    
                from langchain_experimental.text_splitter import SemanticChunker

                chunker = SemanticChunker(
                    embeddings=embeddings,
                    buffer_size=1,
                    breakpoint_threshold_type="percentile",
                    breakpoint_threshold_amount=95,
                )
                docs = chunker.create_documents([combined_text])
                return docs
            except Exception as e:
                logger.warning(f"Semantic chunking failed, using recursive fallback: {e}")
                # Fallback to recursive character splitting (no extra dependency)
                from langchain.text_splitter import RecursiveCharacterTextSplitter
                splitter = RecursiveCharacterTextSplitter(
                    chunk_size=800,
                    chunk_overlap=150,
                    separators=["\n\n", "\n", ". ", " "],
                )
                return splitter.create_documents([combined_text])

        loop = asyncio.get_running_loop()
        docs = await loop.run_in_executor(None, _sync_split)

        # Map chunks back to page numbers based on content position
        page_map = self._build_page_map(elements)

        chunks = []
        for doc in docs:
            text = doc.page_content.strip()
            if not text:
                continue

            # Find the best matching page number
            page_num = self._find_page_for_text(text, page_map)
            section = self._find_section_for_text(text, elements)

            chunks.append(DocumentChunk(
                text=text,
                page_number=page_num,
                section_title=section,
                document_id=document_id,
                source_filename=source_filename,
                element_type="text",
            ))

        return chunks

    def _build_page_map(self, elements: List[ParsedElement]) -> List[tuple]:
        """Build a mapping of text positions to page numbers."""
        page_map = []
        offset = 0
        for elem in elements:
            page_map.append((offset, offset + len(elem.text), elem.page_number))
            offset += len(elem.text) + 2  # +2 for "\n\n"
        return page_map

    def _find_page_for_text(self, text: str, page_map: List[tuple]) -> int:
        """Find the page number for a given chunk text."""
        if not page_map:
            return 0
        # Use the first 50 chars of the chunk to locate it
        search = text[:50]
        for start, end, page in page_map:
            if search in text:
                return page
        return page_map[0][2]  # Default to first page

    def _find_section_for_text(self, text: str, elements: List[ParsedElement]) -> str:
        """Find the nearest section title for a chunk."""
        # Walk backwards through elements to find the nearest title
        for elem in reversed(elements):
            if elem.element_type in ("title", "header") and elem.text:
                return elem.text
        return ""
