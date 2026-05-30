"""
Chat router — SSE streaming chat endpoint + conversation history.
"""

import json
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from loguru import logger
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_current_user, get_db
from app.models import Conversation, Document, Message, User
from app.schemas import (
    ChatRequest,
    ConversationListResponse,
    ConversationResponse,
    ChatMessage,
    SourceChunk,
)

router = APIRouter(prefix="/chat", tags=["Chat"])
limiter = Limiter(key_func=get_remote_address)


async def _get_conversation_history(
    db: AsyncSession,
    conversation_id: uuid.UUID,
    limit: int = 12,  # 6 exchanges = 12 messages
) -> list[dict]:
    """Load the last N messages from a conversation for history context."""
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    messages = result.scalars().all()
    # Reverse to chronological order
    messages = list(reversed(messages))
    return [{"role": msg.role, "content": msg.content} for msg in messages]


@router.post("")
@limiter.limit("10/minute")
async def chat(
    request: Request,
    body: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Stream an answer via SSE.
    Sends JSON lines: {type: "token", content: "..."} and {type: "sources", data: [...]}
    """
    # Get or create conversation
    if body.conversation_id:
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == body.conversation_id,
                Conversation.user_id == current_user.id,
            )
        )
        conversation = result.scalar_one_or_none()
        if conversation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found.",
            )
    else:
        # Create new conversation
        conversation = Conversation(
            user_id=current_user.id,
            title=body.message[:100],  # Use first 100 chars as title
        )
        db.add(conversation)
        await db.flush()
        await db.refresh(conversation)

    # Validate document_ids belong to user
    document_ids = []
    if body.document_ids:
        for doc_id in body.document_ids:
            result = await db.execute(
                select(Document).where(
                    Document.id == doc_id,
                    Document.user_id == current_user.id,
                    Document.status == "indexed",
                )
            )
            doc = result.scalar_one_or_none()
            if doc is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Document {doc_id} not found or not yet indexed.",
                )
            document_ids.append(str(doc_id))

    # Save user message
    user_message = Message(
        conversation_id=conversation.id,
        role="user",
        content=body.message,
    )
    db.add(user_message)
    await db.flush()

    # Load chat history (last 6 exchanges)
    history = await _get_conversation_history(db, conversation.id)

    # We need to commit here so the Celery/RAG service can read the data
    await db.commit()

    # Stream response via SSE
    async def event_stream() -> AsyncGenerator[str, None]:
        full_answer = ""
        sources = []

        try:
            from app.services.rag_service import RAGPipeline
            rag = RAGPipeline()

            async for event in rag.stream_answer(
                query=body.message,
                chat_history=history,
                user_id=str(current_user.id),
                document_ids=document_ids,
            ):
                if event["type"] == "token":
                    full_answer += event["content"]
                    yield f"data: {json.dumps(event)}\n\n"
                elif event["type"] == "sources":
                    sources = event["data"]
                    yield f"data: {json.dumps(event)}\n\n"
                elif event["type"] == "error":
                    yield f"data: {json.dumps(event)}\n\n"

        except Exception as e:
            logger.error(f"RAG pipeline error: {e}", exc_info=True)
            error_event = {"type": "error", "content": f"An error occurred: {str(e)}"}
            yield f"data: {json.dumps(error_event)}\n\n"
            full_answer = f"I encountered an error processing your question: {str(e)}"

        # Save assistant message
        try:
            async with (await _get_session()) as save_db:
                assistant_message = Message(
                    conversation_id=conversation.id,
                    role="assistant",
                    content=full_answer,
                    sources_json=json.dumps(sources) if sources else None,
                )
                save_db.add(assistant_message)
                await save_db.commit()
        except Exception as e:
            logger.error(f"Failed to save assistant message: {e}")

        # Send done event
        done_event = {"type": "done", "conversation_id": str(conversation.id)}
        yield f"data: {json.dumps(done_event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _get_session():
    """Get a new database session for saving inside the SSE stream."""
    from app.database import async_session_factory
    return async_session_factory()


@router.get("/conversations", response_model=ConversationListResponse)
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all conversations for the current user."""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
    )
    conversations = result.scalars().all()
    return ConversationListResponse(
        conversations=[
            ConversationResponse(
                id=c.id,
                title=c.title,
                created_at=c.created_at,
                updated_at=c.updated_at,
            )
            for c in conversations
        ]
    )


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a conversation and all its messages."""
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
    )
    conversation = result.scalar_one_or_none()
    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )
    await db.delete(conversation)
    await db.commit()


@router.get("/history/{conversation_id}", response_model=ConversationResponse)
async def get_conversation_history(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get full conversation history with all messages."""
    result = await db.execute(
        select(Conversation)
        .where(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .options(selectinload(Conversation.messages))
    )
    conversation = result.scalar_one_or_none()
    if conversation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )

    return ConversationResponse(
        id=conversation.id,
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=[
            ChatMessage(
                id=msg.id,
                role=msg.role,
                content=msg.content,
                sources=json.loads(msg.sources_json) if msg.sources_json else None,
                created_at=msg.created_at,
            )
            for msg in conversation.messages
        ],
    )
