"""
LLM service — Groq API wrapper with streaming support.
Uses the Groq Python SDK directly (not langchain-groq) to avoid
asyncio future-chaining bugs in langchain-core.
"""
from typing import AsyncGenerator
from app.config import get_settings

settings = get_settings()


class LLMService:
    """LLM wrapper using Groq API (llama-3.3-70b-versatile).

    Uses `groq.AsyncGroq` directly instead of `langchain_groq.ChatGroq`
    to eliminate langchain-core's `_chain_future` bugs that cause
    "a coroutine was expected, got <Future pending>" errors.
    """

    def __init__(self):
        self._client = None

    def _get_client(self):
        """Get the Groq async client (lazy-loaded, single instance)."""
        if self._client is None:
            from groq import AsyncGroq
            self._client = AsyncGroq(api_key=settings.groq_api_key)
        return self._client

    def _convert_messages(self, messages: list) -> list:
        """Convert LangChain message objects to plain dicts if needed."""
        converted = []
        for msg in messages:
            if hasattr(msg, "content"):
                # It's a LangChain message object (e.g. HumanMessage)
                role = getattr(msg, "type", "user").replace("human", "user").replace("ai", "assistant").replace("system", "system")
                converted.append({"role": role, "content": msg.content})
            elif isinstance(msg, dict):
                # Already a plain dict
                converted.append(msg)
            else:
                converted.append({"role": "user", "content": str(msg)})
        return converted

    async def agenerate(self, messages: list) -> str:
        """Generate a non-streaming response."""
        client = self._get_client()
        groq_messages = self._convert_messages(messages)
        response = await client.chat.completions.create(
            model=settings.groq_model,
            messages=groq_messages,
            temperature=settings.groq_temperature,
            max_tokens=settings.groq_max_tokens,
        )
        return response.choices[0].message.content

    async def astream(self, messages: list) -> AsyncGenerator[str, None]:
        """Stream response tokens."""
        client = self._get_client()
        groq_messages = self._convert_messages(messages)
        stream = await client.chat.completions.create(
            model=settings.groq_model,
            messages=groq_messages,
            temperature=settings.groq_temperature,
            max_tokens=settings.groq_max_tokens,
            stream=True,
        )
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
