"""
RAG pipeline — full retrieval-augmented generation with history-aware rewriting.

Phase 1: Simple RAG (current)
  Query → History-Aware Rewrite → Hybrid Retrieve (10) → Re-Rank (4) → LLM → Stream Answer

# PHASE 2 EXTENSION POINT:
# To add agentic RAG, replace the `answer()` method with a ReActAgent
# that uses `search()` as a tool. Structure:
#   - Create a ToolRegistry with document-specific query engines
#   - Wrap VectorService.search() as a LangChain Tool
#   - Use LangChain ReActAgent with multi-hop retrieval
#   - Add self-correction: if faithfulness < 0.7, re-retrieve
# Do NOT implement any of the above in Phase 1.
"""
import json
from typing import AsyncGenerator, Dict, List, Optional
from loguru import logger
from app.config import get_settings
from app.services.llm_service import LLMService
from app.services.vector_service import VectorService

settings = get_settings()

RAG_SYSTEM_PROMPT = """You are a precise document analysis assistant. Answer the user's question based ONLY on the provided context.
If the context doesn't contain the answer, say "I don't have enough information to answer that."
Always cite your sources using [Source: Page X] format.

Chat History:
{chat_history}

Retrieved Context:
{context}

User Question:
{input}

Answer:"""

REWRITE_PROMPT = """Given the following chat history and a follow-up question, rephrase the follow-up question to be a standalone question that can be understood without the chat history context.

Chat History:
{chat_history}

Follow-up Question: {question}

Standalone Question:"""


class RAGPipeline:
    """Simple RAG pipeline with hybrid retrieval and re-ranking."""

    def __init__(self):
        self.llm_service = LLMService()
        self.vector_service = VectorService()

    async def _rewrite_query(self, query: str, chat_history: List[Dict]) -> str:
        """Rewrite follow-up questions into standalone queries using LLM."""
        if not chat_history:
            return query

        history_text = "\n".join(
            f"{msg['role'].capitalize()}: {msg['content']}" for msg in chat_history[-6:]
        )
        prompt = REWRITE_PROMPT.format(chat_history=history_text, question=query)

        rewritten = await self.llm_service.agenerate([{"role": "user", "content": prompt}])
        logger.info(f"Query rewritten: '{query}' → '{rewritten}'")
        return rewritten.strip() or query

    async def stream_answer(
        self,
        query: str,
        chat_history: List[Dict],
        user_id: str,
        document_ids: Optional[List[str]] = None,
    ) -> AsyncGenerator[Dict, None]:
        """
        Full RAG pipeline with streaming.
        Yields events: {type: "token", content: "..."} and {type: "sources", data: [...]}
        """
        try:
            # Step 1: History-aware query rewriting
            standalone_query = await self._rewrite_query(query, chat_history)

            # Step 2: Hybrid retrieval (top 10)
            raw_chunks = await self.vector_service.search(
                query=standalone_query,
                user_id=user_id,
                document_ids=document_ids,
                top_k=10,
            )

            if not raw_chunks:
                yield {"type": "token", "content": "I couldn't find any relevant information in your documents. Please make sure you've uploaded and indexed the documents you want to query."}
                yield {"type": "sources", "data": []}
                return

            # Step 3: Re-rank (top 4) — using RRF scores
            reranked_chunks = await self.vector_service.rerank(standalone_query, raw_chunks, top_n=4)

            # Step 4: Build context
            context_parts = []
            for i, chunk in enumerate(reranked_chunks):
                page = chunk.get("page_number", "?")
                source = chunk.get("source_filename", "unknown")
                context_parts.append(f"[Chunk {i+1} | Page {page} | {source}]\n{chunk['text']}")
            context = "\n\n---\n\n".join(context_parts)

            # Build chat history string
            history_text = ""
            if chat_history:
                history_text = "\n".join(
                    f"{msg['role'].capitalize()}: {msg['content']}" for msg in chat_history[-6:]
                )

            # Step 5: Build prompt and stream LLM response
            filled_prompt = RAG_SYSTEM_PROMPT.format(
                chat_history=history_text or "No previous conversation.",
                context=context,
                input=query,
            )

            async for token in self.llm_service.astream([{"role": "user", "content": filled_prompt}]):
                yield {"type": "token", "content": token}

            # Step 6: Emit sources
            sources = []
            for chunk in reranked_chunks:
                sources.append({
                    "text": chunk["text"][:500],  # Truncate for frontend
                    "page_number": chunk.get("page_number", 0),
                    "section_title": chunk.get("section_title", ""),
                    "source_filename": chunk.get("source_filename", ""),
                    "relevance_score": round(chunk.get("relevance_score", 0.0), 4),
                })
            yield {"type": "sources", "data": sources}

        except Exception as e:
            logger.error(f"RAG pipeline error: {e}", exc_info=True)
            yield {"type": "error", "content": str(e)}
