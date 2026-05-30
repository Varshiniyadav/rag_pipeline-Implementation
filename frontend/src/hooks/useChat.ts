import { useState } from 'react';
import { useChatStore } from '../stores/chatStore';
import { ChatMessage } from '../types';

export const useChat = () => {
  const {
    currentConversationId,
    setCurrentConversationId,
    selectedDocumentIds,
    addMessage,
    updateStreamingMessage,
    finalizeStreamingMessage,
    isStreaming,
    setStreaming,
  } = useChatStore();

  const [error, setError] = useState<string | null>(null);

  const sendMessage = async (messageText: string) => {
    if (!messageText.trim() || isStreaming) return;

    setError(null);
    setStreaming(true);

    // 1. Add User Message immediately
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
      created_at: new Date().toISOString(),
    };
    addMessage(userMsg);

    // 2. Add empty streaming Assistant Message
    const assistantMsgId = crypto.randomUUID();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      sources: null,
      created_at: new Date().toISOString(),
      isStreaming: true,
    };
    addMessage(assistantMsg);

    const token = localStorage.getItem('accessToken');
    const API_URL = import.meta.env.VITE_API_URL || '';

    try {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: messageText,
          conversation_id: currentConversationId || undefined,
          document_ids: selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server returned error status ${response.status}`);
      }

      if (!response.body) {
        throw new Error('No response body returned from server.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // SSE responses separate events with two newlines '\n\n'
        const parts = buffer.split('\n\n');
        // Keep the last partial event in the buffer
        buffer = parts.pop() || '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;

          try {
            const dataStr = line.substring(6);
            const parsed = JSON.parse(dataStr);

            switch (parsed.type) {
              case 'token':
                updateStreamingMessage(parsed.content);
                break;
              case 'sources':
                updateStreamingMessage('', parsed.data);
                break;
              case 'error':
                setError(parsed.content);
                updateStreamingMessage(`\n\n[Error: ${parsed.content}]`);
                break;
              case 'done':
                // Persist conversation id
                if (parsed.conversation_id && !currentConversationId) {
                  setCurrentConversationId(parsed.conversation_id);
                }
                break;
            }
          } catch (jsonErr) {
            console.error('Failed to parse SSE data block:', line, jsonErr);
          }
        }
      }

      // Finalize and close streaming flag
      finalizeStreamingMessage();

    } catch (err: any) {
      console.error('Stream failure:', err);
      setError(err.message || 'Connection lost.');
      updateStreamingMessage(`\n\n[Failed to complete connection: ${err.message || 'Check connection'}]`);
      finalizeStreamingMessage([]);
    } finally {
      setStreaming(false);
    }
  };

  return {
    sendMessage,
    isStreaming,
    error,
  };
};
