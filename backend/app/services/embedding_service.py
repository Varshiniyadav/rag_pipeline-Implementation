"""
Embedding service — generates dense vectors using BAAI/bge-large-en-v1.5.
Lazy-loads the model (~1.3GB) on first use. Singleton pattern.
"""
import asyncio
import os
from typing import List
from loguru import logger
from app.config import get_settings

settings = get_settings()

# Fix for PyTorch OpenMP collision on Windows
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

class EmbeddingService:
    _instance = None
    _embeddings = None
    _loading_task = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def _get_model(self):
        if self._embeddings is None:
            if self._loading_task is None:
                loop = asyncio.get_running_loop()
                def load():
                    logger.info(f"Loading embedding model: {settings.embedding_model}")
                    from langchain_huggingface import HuggingFaceEmbeddings
                    self._embeddings = HuggingFaceEmbeddings(
                        model_name=settings.embedding_model,
                        model_kwargs={"device": settings.embedding_device},
                        encode_kwargs={"normalize_embeddings": True, "batch_size": 32},
                    )
                    logger.info("Embedding model loaded")
                self._loading_task = loop.run_in_executor(None, load)
            
            await self._loading_task

        return self._embeddings

    async def embed_texts(self, texts: List[str]) -> List[List[float]]:
        model = await self._get_model()
        loop = asyncio.get_running_loop()
        all_embeddings = []
        for i in range(0, len(texts), 32):
            batch = texts[i:i + 32]
            batch_emb = await loop.run_in_executor(None, model.embed_documents, batch)
            all_embeddings.extend(batch_emb)
        return all_embeddings

    async def embed_query(self, query: str) -> List[float]:
        model = await self._get_model()
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, model.embed_query, query)
