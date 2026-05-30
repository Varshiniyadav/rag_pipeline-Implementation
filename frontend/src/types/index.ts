export interface User {
  id: string;
  email: string;
  created_at: string;
}

export type DocumentStatus = 'uploading' | 'processing' | 'parsing' | 'chunking' | 'embedding' | 'indexed' | 'failed';

export interface Document {
  id: string;
  filename: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  status: DocumentStatus;
  error_message?: string;
  chunk_count: number;
  page_count: number;
  created_at: string;
  updated_at?: string;
}

export interface DocumentListResponse {
  documents: Document[];
  total: number;
}

export interface SourceChunk {
  text: string;
  page_number?: number;
  section_title?: string;
  source_filename: string;
  relevance_score: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: SourceChunk[] | null;
  created_at: string;
  isStreaming?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at?: string;
  messages?: ChatMessage[];
}

export interface ConversationListResponse {
  conversations: Conversation[];
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface ErrorResponse {
  error: string;
  detail: string;
}

// SSE Event interfaces
export type SSEEvent = 
  | { type: 'token'; content: string }
  | { type: 'sources'; data: SourceChunk[] }
  | { type: 'error'; content: string }
  | { type: 'done'; conversation_id: string };
