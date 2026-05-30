"""
Pydantic v2 request/response schemas for all API endpoints.
"""


import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


# ── Auth Schemas ──────────────────────────────────────────────

class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Document Schemas ─────────────────────────────────────────

class DocumentResponse(BaseModel):
    id: uuid.UUID
    filename: str
    original_filename: str
    file_size: int
    mime_type: str
    status: str
    error_message: Optional[str] = None
    chunk_count: int = 0
    page_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int


# ── Chat Schemas ─────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)
    conversation_id: Optional[uuid.UUID] = None
    document_ids: Optional[List[uuid.UUID]] = None


class SourceChunk(BaseModel):
    text: str
    page_number: Optional[int] = None
    section_title: Optional[str] = None
    source_filename: str = ""
    relevance_score: float = 0.0


class ChatMessage(BaseModel):
    id: uuid.UUID
    role: str
    content: str
    sources: Optional[List[SourceChunk]] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationResponse(BaseModel):
    id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    messages: List[ChatMessage] = []

    model_config = {"from_attributes": True}


class ConversationListResponse(BaseModel):
    conversations: List[ConversationResponse]


# ── SSE Event Schemas ────────────────────────────────────────

class SSETokenEvent(BaseModel):
    type: str = "token"
    content: str


class SSESourcesEvent(BaseModel):
    type: str = "sources"
    data: List[SourceChunk]


class SSEErrorEvent(BaseModel):
    type: str = "error"
    content: str


class SSEDoneEvent(BaseModel):
    type: str = "done"
    conversation_id: uuid.UUID


# ── Health Check ─────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "1.0.0"
    services: Dict[str, str] = {}


# ── Error Response ───────────────────────────────────────────

class ErrorResponse(BaseModel):
    error: str
    detail: str = ""
