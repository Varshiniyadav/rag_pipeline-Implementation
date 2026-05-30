"""
Document parsing service — extracts text, tables, and metadata from documents.
Windows-native implementation using reliable, dependency-free parsers:
  PDF  → unstructured (from requirements.txt)
  DOCX → python-docx
  TXT  → direct read
Optional: LlamaParse (if API key provided)
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from loguru import logger

from app.config import get_settings

settings = get_settings()


@dataclass
class ParsedElement:
    """A single parsed element from a document."""
    text: str
    element_type: str  # "text", "table", "title", "header", "list"
    page_number: int = 0
    section_title: str = ""
    metadata: dict = field(default_factory=dict)


class ParserService:
    """Document parsing with Windows-compatible parsers."""

    async def parse(self, file_path: str) -> List[ParsedElement]:
        """
        Parse a document using the best available parser.
        Order:
        1. LlamaParse (if API key set and file is PDF)
        2. pypdf (for PDFs)
        3. python-docx (for DOCX)
        4. plain text reader (for TXT)
        """
        ext = Path(file_path).suffix.lower()
        logger.info(f"Parsing document: {file_path} (type: {ext})")

        # Try LlamaParse first if API key is available
        if settings.llamaparse_available and ext == ".pdf":
            try:
                logger.info("Attempting LlamaParse...")
                result = await self._parse_with_llamaparse(file_path)
                logger.info(f"LlamaParse succeeded: {len(result)} elements")
                return result
            except Exception as e:
                logger.warning(f"LlamaParse failed, falling back: {e}")

        # Route to the correct parser based on extension
        if ext == ".pdf":
            logger.info("Parsing PDF with pypdf...")
            return await self._parse_pdf(file_path)
        elif ext == ".docx":
            logger.info("Parsing DOCX with python-docx...")
            return await self._parse_docx(file_path)
        elif ext == ".txt":
            logger.info("Parsing TXT as plain text...")
            return await self._parse_plain_text(file_path)
        else:
            raise ValueError(f"Unsupported file type: {ext}")

    async def _parse_with_llamaparse(self, file_path: str) -> List[ParsedElement]:
        """Parse PDF using LlamaParse cloud API."""
        from llama_parse import LlamaParse

        parser = LlamaParse(
            api_key=settings.llamaparse_api_key,
            result_type="markdown",
            verbose=True,
        )

        import asyncio
        try:
            documents = await asyncio.wait_for(parser.aload_data(file_path), timeout=300.0)
        except asyncio.TimeoutError:
            raise Exception("LlamaParse API timed out after 5 minutes.")
            
        elements = []
        for i, doc in enumerate(documents):
            elements.append(ParsedElement(
                text=doc.text,
                element_type="text",
                page_number=doc.metadata.get("page_number", i + 1),
                section_title=doc.metadata.get("section_title", ""),
                metadata=doc.metadata,
            ))
        return elements

    async def _parse_pdf(self, file_path: str) -> List[ParsedElement]:
        """Parse PDF using unstructured — from requirements.txt."""
        import asyncio

        def _sync_parse():
            from unstructured.partition.pdf import partition_pdf
            raw_elements = partition_pdf(filename=file_path)
            elements = []
            for i, el in enumerate(raw_elements):
                text = str(el).strip()
                if text:
                    # Unstructured metadata usually has page_number
                    page_num = 1
                    if hasattr(el, "metadata") and hasattr(el.metadata, "page_number"):
                        page_num = el.metadata.page_number or 1

                    element_type = "text"
                    if "Table" in str(type(el)):
                        element_type = "table"
                    elif "Title" in str(type(el)):
                        element_type = "title"
                    elif "Header" in str(type(el)):
                        element_type = "header"

                    elements.append(ParsedElement(
                        text=text,
                        element_type=element_type,
                        page_number=page_num,
                        section_title="",
                        metadata={"filename": Path(file_path).name, "page": page_num},
                    ))

            if not elements:
                logger.warning(f"unstructured extracted no text from {file_path}. File may be scanned/image-based.")

            return elements

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _sync_parse)

    async def _parse_plain_text(self, file_path: str) -> List[ParsedElement]:
        """Parse plain text file."""
        import aiofiles
        async with aiofiles.open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = await f.read()

        # Split into paragraphs for better chunking
        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
        if not paragraphs:
            paragraphs = [content.strip()] if content.strip() else []

        return [
            ParsedElement(
                text=para,
                element_type="text",
                page_number=1,
                section_title="",
                metadata={"filename": Path(file_path).name},
            )
            for para in paragraphs
        ]

    async def _parse_docx(self, file_path: str) -> List[ParsedElement]:
        """Parse DOCX file using python-docx."""
        import asyncio

        def _sync_parse():
            from docx import Document
            doc = Document(file_path)
            elements = []
            current_section = ""

            for para in doc.paragraphs:
                text = para.text.strip()
                if not text:
                    continue

                # Detect headings
                if para.style and para.style.name and para.style.name.startswith("Heading"):
                    current_section = text
                    elements.append(ParsedElement(
                        text=text,
                        element_type="title",
                        page_number=1,
                        section_title=current_section,
                        metadata={"style": para.style.name},
                    ))
                else:
                    elements.append(ParsedElement(
                        text=text,
                        element_type="text",
                        page_number=1,
                        section_title=current_section,
                        metadata={},
                    ))

            # Also extract tables
            for table in doc.tables:
                rows = []
                for row in table.rows:
                    cells = [cell.text.strip() for cell in row.cells]
                    rows.append(" | ".join(cells))
                table_text = "\n".join(rows)
                if table_text.strip():
                    elements.append(ParsedElement(
                        text=table_text,
                        element_type="table",
                        page_number=1,
                        section_title=current_section,
                        metadata={},
                    ))

            return elements

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _sync_parse)
