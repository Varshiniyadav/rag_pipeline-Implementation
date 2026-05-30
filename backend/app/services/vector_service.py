"""
Vector service — Qdrant operations: collection setup, upsert, hybrid search, re-ranking.
Implements dense + sparse (BM25) retrieval with RRF fusion.
"""
import asyncio
import uuid
from collections import defaultdict
from typing import Dict, List, Optional, Tuple
from loguru import logger
from app.config import get_settings
from app.services.chunking_service import DocumentChunk

settings = get_settings()

COLLECTION_NAME = "documents"


class VectorService:
    """Qdrant vector operations with hybrid search and re-ranking."""

    def __init__(self):
        self._client = None
        self._reranker = None
        self._bm25_fitted = {}

    def _get_client(self):
        if self._client is None:
            from qdrant_client import QdrantClient
            if settings.qdrant_url:
                # Remote Qdrant Cloud or self-hosted
                self._client = QdrantClient(
                    url=settings.qdrant_url,
                    api_key=settings.qdrant_api_key or None,
                    timeout=60,
                )
                logger.info(f"Connected to remote Qdrant: {settings.qdrant_url}")
            else:
                # Local file-based Qdrant — no server needed, data persists
                import os
                qdrant_path = os.path.join(os.getcwd(), "qdrant_storage")
                os.makedirs(qdrant_path, exist_ok=True)
                self._client = QdrantClient(path=qdrant_path)
                logger.info(f"Using local file-based Qdrant at: {qdrant_path}")
            self._ensure_collection()
        return self._client

    def _ensure_collection(self):
        """Create collection if it doesn't exist."""
        from qdrant_client.models import (
            Distance, VectorParams, SparseVectorParams,
            SparseIndexParams, PayloadSchemaType, HnswConfigDiff,
        )
        client = self._client
        collections = [c.name for c in client.get_collections().collections]
        if COLLECTION_NAME not in collections:
            client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config={
                    "dense": VectorParams(
                        size=384,
                        distance=Distance.COSINE,
                        hnsw_config=HnswConfigDiff(m=16, ef_construct=100),
                    )
                },
                sparse_vectors_config={"text_sparse": SparseVectorParams(
                    index=SparseIndexParams()
                )},
            )
            # Create payload indices for filtering
            for field_name, schema_type in [
                ("document_id", PayloadSchemaType.KEYWORD),
                ("user_id", PayloadSchemaType.KEYWORD),
                ("page_number", PayloadSchemaType.INTEGER),
                ("section_title", PayloadSchemaType.KEYWORD),
                ("source_filename", PayloadSchemaType.KEYWORD),
            ]:
                client.create_payload_index(
                    collection_name=COLLECTION_NAME,
                    field_name=field_name,
                    field_schema=schema_type,
                )
            logger.info(f"Created Qdrant collection: {COLLECTION_NAME}")

    def _compute_sparse_vector(self, text: str) -> Tuple[List[int], List[float]]:
        """Compute BM25-style sparse vector from text tokens."""
        import re
        from collections import Counter
        tokens = re.findall(r'\w+', text.lower())
        freq = Counter(tokens)
        indices = [hash(t) % 2**31 for t in freq.keys()]
        values = [float(v) for v in freq.values()]
        return indices, values

    async def upsert_chunks(self, chunks: List[DocumentChunk], embeddings: List[List[float]]) -> int:
        """Upsert chunks with both dense and sparse vectors into Qdrant."""
        from qdrant_client.models import PointStruct, SparseVector
        client = self._get_client()
        points = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            indices, values = self._compute_sparse_vector(chunk.text)
            point_id = str(uuid.uuid4())
            points.append(PointStruct(
                id=point_id,
                vector={"dense": embedding, "text_sparse": SparseVector(indices=indices, values=values)},
                payload={
                    "text": chunk.text,
                    "document_id": chunk.document_id,
                    "user_id": chunk.metadata.get("user_id", ""),
                    "page_number": chunk.page_number,
                    "section_title": chunk.section_title,
                    "source_filename": chunk.source_filename,
                    "chunk_index": chunk.chunk_index,
                    "element_type": chunk.element_type,
                },
            ))

        # Batch upsert
        batch_size = 64
        loop = asyncio.get_running_loop()
        for i in range(0, len(points), batch_size):
            batch = points[i:i + batch_size]

            def _upsert(b=batch):
                client.upsert(collection_name=COLLECTION_NAME, points=b, wait=True)

            await loop.run_in_executor(None, _upsert)

        logger.info(f"Upserted {len(points)} vectors to Qdrant")
        return len(points)

    async def search(self, query: str, user_id: str, document_ids: Optional[List[str]] = None,
                     top_k: int = 10) -> List[Dict]:
        """
        Hybrid search: dense + sparse with RRF fusion.
        Filters by user_id for multi-tenancy.
        Returns top_k chunks before re-ranking.
        """
        from app.services.embedding_service import EmbeddingService
        from qdrant_client.models import Filter, FieldCondition, MatchValue, SearchRequest, SparseVector, NamedSparseVector, NamedVector

        embedding_svc = EmbeddingService()
        query_embedding = await embedding_svc.embed_query(query)

        # Build filter
        must_conditions = [FieldCondition(key="user_id", match=MatchValue(value=user_id))]
        if document_ids:
            must_conditions.append(FieldCondition(key="document_id", match=MatchValue(value=document_ids[0])))
            # For multiple docs, we'd use a should filter — simplified for now

        search_filter = Filter(must=must_conditions)
        client = self._get_client()

        # Dense search — use named vector "dense"
        def _dense_search():
            return client.search(
                collection_name=COLLECTION_NAME,
                query_vector=NamedVector(name="dense", vector=query_embedding),
                query_filter=search_filter,
                limit=top_k,
                with_payload=True,
            )

        # Sparse search
        sparse_indices, sparse_values = self._compute_sparse_vector(query)

        def _sparse_search():
            return client.search(
                collection_name=COLLECTION_NAME,
                query_vector=NamedSparseVector(
                    name="text_sparse",
                    vector=SparseVector(indices=sparse_indices, values=sparse_values)
                ),
                query_filter=search_filter,
                limit=top_k,
                with_payload=True,
            )

        loop = asyncio.get_running_loop()
        dense_results = await loop.run_in_executor(None, _dense_search)
        sparse_results = await loop.run_in_executor(None, _sparse_search)

        # RRF Fusion (k=60)
        fused = self._rrf_fusion(dense_results, sparse_results, k=60)

        # Return top_k fused results
        return fused[:top_k]

    def _rrf_fusion(self, dense_results, sparse_results, k: int = 60) -> List[Dict]:
        """Reciprocal Rank Fusion: score = sum(1 / (k + rank)) across both result sets."""
        scores = defaultdict(float)
        result_map = {}

        for rank, hit in enumerate(dense_results):
            doc_key = hit.id
            scores[doc_key] += 1.0 / (k + rank + 1)
            result_map[doc_key] = hit

        for rank, hit in enumerate(sparse_results):
            doc_key = hit.id
            scores[doc_key] += 1.0 / (k + rank + 1)
            if doc_key not in result_map:
                result_map[doc_key] = hit

        sorted_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
        results = []
        for doc_id in sorted_ids:
            hit = result_map[doc_id]
            payload = hit.payload or {}
            results.append({
                "text": payload.get("text", ""),
                "page_number": payload.get("page_number", 0),
                "section_title": payload.get("section_title", ""),
                "source_filename": payload.get("source_filename", ""),
                "document_id": payload.get("document_id", ""),
                "chunk_index": payload.get("chunk_index", 0),
                "rrf_score": scores[doc_id],
            })
        return results

    async def rerank(self, query: str, chunks: List[Dict], top_n: int = 4) -> List[Dict]:
        """
        Cross-encoder re-ranking is disabled — using RRF fusion scores only.
        Returns top_n chunks sorted by their RRF score.
        """
        if not chunks:
            return []

        ranked = sorted(chunks, key=lambda x: x["rrf_score"], reverse=True)
        for chunk in ranked:
            chunk["relevance_score"] = chunk["rrf_score"]
        return ranked[:top_n]

    async def delete_document_vectors(self, document_id: str):
        """Delete all vectors for a given document."""
        from qdrant_client.models import Filter, FieldCondition, MatchValue
        client = self._get_client()

        def _delete():
            client.delete(
                collection_name=COLLECTION_NAME,
                points_selector=Filter(
                    must=[FieldCondition(key="document_id", match=MatchValue(value=document_id))]
                ),
            )

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _delete)
        logger.info(f"Deleted vectors for document {document_id}")
