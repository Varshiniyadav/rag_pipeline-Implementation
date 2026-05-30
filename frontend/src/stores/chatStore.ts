import { create } from 'zustand';
import { User, Document, Conversation, ChatMessage, SourceChunk } from '../types';

interface ChatState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  conversations: Conversation[];
  currentConversationId: string | null;
  currentConversation: Conversation | null;
  documents: Document[];
  selectedDocumentIds: string[];
  isStreaming: boolean;
  isAuthRefreshing: boolean;
  authRefreshError: string | null;
  
  // Actions
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  setConversations: (conversations: Conversation[]) => void;
  setCurrentConversationId: (id: string | null) => void;
  setCurrentConversation: (conversation: Conversation | null) => void;
  setDocuments: (documents: Document[]) => void;
  toggleDocumentSelection: (docId: string) => void;
  setSelectedDocumentIds: (docIds: string[]) => void;
  setStreaming: (isStreaming: boolean) => void;
  setAuthRefreshing: (isRefreshing: boolean) => void;
  setAuthRefreshError: (error: string | null) => void;
  
  // Message mutations
  addMessage: (message: ChatMessage) => void;
  updateStreamingMessage: (content: string, sources?: SourceChunk[]) => void;
  finalizeStreamingMessage: (sources?: SourceChunk[]) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  user: null,
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  conversations: [],
  currentConversationId: null,
  currentConversation: null,
  documents: [],
  selectedDocumentIds: [],
  isStreaming: false,
  isAuthRefreshing: false,
  authRefreshError: null,

  setAuth: (user, accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    set({ user, accessToken, refreshToken });
  },

  clearAuth: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    // Note: authRefreshError is NOT cleared here so it persists on the login page
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      conversations: [],
      currentConversationId: null,
      currentConversation: null,
      documents: [],
      selectedDocumentIds: [],
      isStreaming: false,
      isAuthRefreshing: false,
    });
  },

  setConversations: (conversations) => set({ conversations }),
  
  setCurrentConversationId: (currentConversationId) => set({ currentConversationId }),
  
  setCurrentConversation: (currentConversation) => set({ currentConversation, currentConversationId: currentConversation?.id || null }),
  
  setDocuments: (documents) => set({ documents }),
  
  toggleDocumentSelection: (docId) => set((state) => {
    const isSelected = state.selectedDocumentIds.includes(docId);
    const selectedDocumentIds = isSelected
      ? state.selectedDocumentIds.filter((id) => id !== docId)
      : [...state.selectedDocumentIds, docId];
    return { selectedDocumentIds };
  }),

  setSelectedDocumentIds: (selectedDocumentIds) => set({ selectedDocumentIds }),
  
  setStreaming: (isStreaming) => set({ isStreaming }),

  setAuthRefreshing: (isAuthRefreshing) => set({ isAuthRefreshing }),

  setAuthRefreshError: (authRefreshError) => set({ authRefreshError }),

  addMessage: (message) => set((state) => {
    if (!state.currentConversation) return {};
    const updatedMessages = [...(state.currentConversation.messages || []), message];
    return {
      currentConversation: {
        ...state.currentConversation,
        messages: updatedMessages,
      },
    };
  }),

  updateStreamingMessage: (content, sources) => set((state) => {
    if (!state.currentConversation) return {};
    const messages = state.currentConversation.messages || [];
    if (messages.length === 0) return {};

    const updatedMessages = [...messages];
    const lastIndex = updatedMessages.length - 1;
    const lastMessage = updatedMessages[lastIndex];

    if (lastMessage.role === 'assistant') {
      updatedMessages[lastIndex] = {
        ...lastMessage,
        content: lastMessage.content + content,
        sources: sources !== undefined ? sources : lastMessage.sources,
      };
    }

    return {
      currentConversation: {
        ...state.currentConversation,
        messages: updatedMessages,
      },
    };
  }),

  finalizeStreamingMessage: (sources) => set((state) => {
    if (!state.currentConversation) return {};
    const messages = state.currentConversation.messages || [];
    if (messages.length === 0) return {};

    const updatedMessages = [...messages];
    const lastIndex = updatedMessages.length - 1;
    const lastMessage = updatedMessages[lastIndex];

    if (lastMessage.role === 'assistant') {
      updatedMessages[lastIndex] = {
        ...lastMessage,
        isStreaming: false,
        sources: sources !== undefined ? sources : lastMessage.sources,
      };
    }

    return {
      currentConversation: {
        ...state.currentConversation,
        messages: updatedMessages,
      },
    };
  }),
}));
