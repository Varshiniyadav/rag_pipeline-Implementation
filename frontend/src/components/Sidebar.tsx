import React, { useEffect, useState } from 'react';
import { Search, Plus, MessageSquare, Trash2, LogOut, CheckSquare, Square, RefreshCw, FileText, Database, ShieldAlert, Cpu, Wifi, WifiOff } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useDocuments } from '../hooks/useDocuments';
import { apiClient } from '../api/client';
import { FileUploadZone } from './FileUploadZone';

interface SidebarProps {
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onLogout }) => {
  const {
    user,
    conversations,
    setConversations,
    currentConversationId,
    setCurrentConversation,
    setCurrentConversationId,
    selectedDocumentIds,
    toggleDocumentSelection,
    isAuthRefreshing,
    authRefreshError,
  } = useChatStore();

  const { documents, deleteDocument, fetchDocuments } = useDocuments();
  // Load documents and past chats on mount
  useEffect(() => {
    fetchDocuments();
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const response = await apiClient.get('/chat/conversations');
      setConversations(response.data.conversations);
    } catch (err) {
      console.error('Failed to load past conversations:', err);
    }
  };

  const startNewChat = () => {
    setCurrentConversation(null);
    setCurrentConversationId(null);
  };

  const selectConversation = async (convId: string) => {
    try {
      const response = await apiClient.get(`/chat/history/${convId}`);
      setCurrentConversation(response.data);
    } catch (err) {
      console.error('Failed to load chat history details:', err);
    }
  };

  const deleteConversation = async (convId: string) => {
    try {
      await apiClient.delete(`/chat/${convId}`);
      // Remove from local state
      setConversations(conversations.filter((c) => c.id !== convId));
      // If the deleted conversation was active, clear it
      if (currentConversationId === convId) {
        setCurrentConversation(null);
        setCurrentConversationId(null);
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  const [searchQuery, setSearchQuery] = useState('');

  const filteredConversations = conversations.filter((c) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 1;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <div className="w-[300px] h-full bg-slate-950/80 border-r border-slate-900 flex flex-col z-20 shrink-0">
      {/* Brand logo */}
      <div className="p-4 border-b border-slate-900 flex items-center space-x-2.5 bg-slate-950/40">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center border border-indigo-400/20 shadow-md shadow-indigo-950/40">
          <Cpu className="w-4.5 h-4.5 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-100 font-outfit uppercase tracking-wider">Antigravity</h1>
          <span className="text-[10px] text-slate-500 font-semibold tracking-wide uppercase">Enterprise RAG</span>
        </div>
      </div>

      {/* File Dropzone */}
      <div className="p-4 border-b border-slate-900">
        <FileUploadZone />
      </div>

      {/* Vector Inventory / Document lists */}
      <div className="p-4 border-b border-slate-900 flex-1 flex flex-col min-h-0">
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 mb-2.5 flex items-center space-x-1">
          <Database className="w-3.5 h-3.5" />
          <span>Knowledge Collection</span>
        </h3>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
          {documents.length === 0 ? (
            <div className="text-center py-6 text-slate-600 text-[11px] leading-relaxed bg-slate-950/20 rounded-xl border border-slate-900/60 p-4">
              <FileText className="w-6 h-6 mx-auto mb-1.5 opacity-30" />
              <span>No document vectors present. Drop a PDF to index pages.</span>
            </div>
          ) : (
            documents.map((doc) => {
              const isSelected = selectedDocumentIds.includes(doc.id);
              const isProcessing = !['indexed', 'failed'].includes(doc.status);
              const isFailed = doc.status === 'failed';

              return (
                <div
                  key={doc.id}
                  className={`p-2.5 rounded-lg border transition-all duration-200 ${
                    isFailed 
                      ? 'border-red-950/40 bg-red-950/5' 
                      : isSelected 
                        ? 'border-indigo-500/20 bg-indigo-950/5' 
                        : 'border-slate-900 bg-slate-950/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    {/* Toggle Selector */}
                    <button
                      onClick={() => !isProcessing && toggleDocumentSelection(doc.id)}
                      disabled={isProcessing}
                      className={`text-slate-400 hover:text-slate-200 mt-0.5 shrink-0 ${
                        isProcessing ? 'opacity-30 cursor-not-allowed' : ''
                      }`}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>

                    {/* File info */}
                    <div className="flex-1 min-w-0">
                      <span className="text-[11.5px] font-semibold text-slate-200 truncate block leading-snug" title={doc.original_filename}>
                        {doc.original_filename}
                      </span>
                      
                      {/* Status indicator badge */}
                      <div className="flex items-center space-x-1.5 mt-1">
                        {isProcessing ? (
                          <span className="text-[9px] font-bold text-amber-400 animate-pulse flex items-center space-x-0.5">
                            <RefreshCw className="w-2.5 h-2.5 animate-spin shrink-0" />
                            <span className="capitalize">{doc.status}...</span>
                          </span>
                        ) : isFailed ? (
                          <span className="text-[9px] font-bold text-red-400 flex items-center space-x-0.5" title={doc.error_message}>
                            <ShieldAlert className="w-2.5 h-2.5 shrink-0" />
                            <span>Failed</span>
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-slate-500">
                            {doc.page_count} pages • {doc.chunk_count} chunks • {formatBytes(doc.file_size)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Trash Delete */}
                    <button
                      onClick={() => deleteDocument(doc.id)}
                      className="p-1 rounded hover:bg-slate-900 text-slate-500 hover:text-red-400 transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Threads */}
      <div className="p-4 border-b border-slate-900 h-[220px] flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1 flex items-center space-x-1">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat History</span>
          </h3>
          
          <button
            onClick={startNewChat}
            className="p-1 rounded bg-slate-900 hover:bg-slate-800/80 border border-slate-800 text-[10px] font-semibold text-indigo-400 hover:text-indigo-300 transition-all flex items-center space-x-0.5"
          >
            <Plus className="w-3 h-3" />
            <span>New</span>
          </button>
        </div>

        {/* Search input */}
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-6 pr-2 py-1.5 rounded-md bg-slate-900/60 border border-slate-800 text-[11px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/20 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <span className="text-[10px] font-bold">✕</span>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 pr-1 min-h-0">
          {conversations.length === 0 ? (
            <div className="text-center py-4 text-slate-600 text-[10px] leading-relaxed">
              No recent conversations.
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-4 text-slate-600 text-[10px] leading-relaxed">
              No conversations match &quot;{searchQuery}&quot;
            </div>
          ) : (
            filteredConversations.map((c) => {
              const isActive = currentConversationId === c.id;
              return (
                <div
                  key={c.id}
                  className={`group flex items-center rounded-md transition-all ${
                    isActive 
                      ? 'bg-slate-900 border border-slate-800' 
                      : 'hover:bg-slate-900/40 border border-transparent'
                  }`}
                >
                  <button
                    onClick={() => selectConversation(c.id)}
                    className={`flex-1 text-left px-2.5 py-1.5 text-[11.5px] transition-all truncate ${
                      isActive 
                        ? 'font-bold text-indigo-300' 
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {c.title}
                  </button>
                  <button
                    onClick={() => deleteConversation(c.id)}
                    className="p-1.5 mr-1 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-800 text-slate-500 hover:text-red-400 transition-all"
                    title="Delete conversation"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* User profile dock */}
      <div className="p-4 bg-slate-950/60 border-t border-slate-900 flex items-center justify-between">
        <div className="min-w-0 flex-1 min-w-0">
          {isAuthRefreshing ? (
            <div className="flex items-center space-x-1.5 animate-pulse">
              <RefreshCw className="w-3 h-3 text-amber-400 animate-spin shrink-0" />
              <div>
                <span className="text-[10px] text-amber-400/90 font-bold uppercase block tracking-wider">
                  Refreshing Session
                </span>
                <span className="text-[10px] text-amber-500/70 block truncate">
                  Renewing authentication token…
                </span>
              </div>
            </div>
          ) : authRefreshError ? (
            <div className="flex items-center space-x-1.5">
              <WifiOff className="w-3 h-3 text-red-400 shrink-0" />
              <div>
                <span className="text-[10px] text-red-400 font-bold uppercase block tracking-wider">
                  Session Expired
                </span>
                <span className="text-[10px] text-red-400/70 block truncate">
                  {authRefreshError}
                </span>
              </div>
            </div>
          ) : (
            <>
              <span className="text-[10px] text-slate-500 font-bold uppercase block tracking-wider flex items-center space-x-1">
                <Wifi className="w-3 h-3 text-emerald-400/70" />
                <span>Session Active</span>
              </span>
              <span className="text-[11.5px] font-semibold text-slate-300 truncate block" title={user?.email}>
                {user?.email || 'user@example.com'}
              </span>
            </>
          )}
        </div>

        <button
          onClick={onLogout}
          disabled={isAuthRefreshing}
          className="p-1.5 rounded-md hover:bg-slate-900 text-slate-400 hover:text-indigo-400 disabled:text-slate-600 disabled:cursor-not-allowed transition-colors"
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
