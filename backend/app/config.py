"""
Application configuration — loads all settings from environment variables.
Uses Pydantic Settings for validation and type coercion.
"""


import os
from functools import lru_cache
from typing import List, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central configuration loaded from .env / environment."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── API Keys ─────────────────────────────────────────────
    groq_api_key: str = ""
    llamaparse_api_key: str = ""
    langchain_api_key: str = ""
    langchain_tracing_v2: bool = False
    langchain_project: str = "rag-document-qa"

    # ── Database (Local PostgreSQL on Windows) ────────────────
    database_url: str = "postgresql+asyncpg://postgres:ragpass@localhost:5432/ragdb"
    postgres_user: str = "postgres"
    postgres_password: str = "ragpass"
    postgres_db: str = "ragdb"

    # ── Qdrant ───────────────────────────────────────────────
    qdrant_url: str = ""
    qdrant_api_key: str = ""

    # ── JWT Auth ─────────────────────────────────────────────
    jwt_secret_key: str = "change_me_to_a_random_64_char_string"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # ── App Settings ─────────────────────────────────────────
    upload_dir: str = "./uploads"
    max_file_size_mb: int = 50
    max_uploads_per_user: int = 10
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # ── Embedding & Re-ranker ────────────────────────────────
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    reranker_model: str = "BAAI/bge-reranker-large" # Disabled — using RRF fusion only
    embedding_device: str = "cpu"

    # ── LLM Config ───────────────────────────────────────────
    groq_model: str = "llama-3.3-70b-versatile"
    groq_temperature: float = 0.1
    groq_max_tokens: int = 2048

    # ── Derived Properties ───────────────────────────────────
    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024

    @property
    def llamaparse_available(self) -> bool:
        return bool(self.llamaparse_api_key)

    @property
    def langsmith_available(self) -> bool:
        return bool(self.langchain_api_key) and self.langchain_tracing_v2


@lru_cache()
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
