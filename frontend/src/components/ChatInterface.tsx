import React, { useState } from 'react';
import { Send, Filter, Info, RefreshCw } from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useChat } from '../hooks/useChat';
import { Sidebar } from './Sidebar';
import { MessageList } from './MessageList';
import { SourcePanel } from './SourcePanel';
import { SourceChunk } from '../types';

interface ChatInterfaceProps {
  onLogout: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ onLogout }) => {
  const { currentConversation, selectedDocumentIds, documents } = useChatStore();
  const { sendMessage, isStreaming, error: chatError } = useChat();
  
  const [inputText, setInputText] = useState('');
  const [isSourceDrawerOpen, setIsSourceDrawerOpen] = useState(false);
  const [activeSources, setActiveSources] = useState<SourceChunk[]>([]);
  const [activePage, setActivePage] = useState<number | null>(null);

  const handleSend = () => {
    if (!inputText.trim() || isStreaming) return;
    sendMessage(inputText);
    setInputText('');
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSourceBadgeClick = (sources: SourceChunk[], pageNumber: number | null) => {
    setActiveSources(sources);
    setActivePage(pageNumber);
    setIsSourceDrawerOpen(true);
  };

  const handleSuggestionClick = (text: string) => {
    if (isStreaming) return;
    sendMessage(text);
  };

  // Get list of currently applied document names as tags
  const activeDocumentNames = documents
    .filter((doc) => selectedDocumentIds.includes(doc.id))
    .map((doc) => doc.original_filename);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans relative">
      {/* Background soft glowing blur spheres */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-900/10 rounded-full blur-[120px] animate-pulse-subtle z-0"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-900/10 rounded-full blur-[120px] animate-pulse-subtle z-0"></div>

      {/* Left panel */}
      <Sidebar onLogout={onLogout} />

      {/* Right Core workspace */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative z-10 bg-slate-950/40">
        
        {/* Workspace Header */}
        <div className="h-14 border-b border-slate-900 px-6 flex items-center justify-between bg-slate-950/20">
          <div className="flex items-center space-x-2">
            <h2 className="text-sm font-bold text-slate-100 font-outfit uppercase tracking-wider">
              {currentConversation?.title || 'Interactive Workspace'}
            </h2>
            {isStreaming && (
              <span className="flex items-center space-x-1 px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-400 text-[9px] font-bold border border-indigo-900/30 animate-pulse">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                <span>LLM Answering...</span>
              </span>
            )}
          </div>

          {/* Filter Status */}
          {activeDocumentNames.length > 0 && (
            <div className="flex items-center space-x-1 text-slate-400 text-[10px] font-semibold bg-slate-900/40 border border-slate-800/80 px-2 py-1 rounded-md max-w-[200px] sm:max-w-[300px]">
              <Filter className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="truncate">Filters: {activeDocumentNames.join(', ')}</span>
            </div>
          )}
        </div>

        {/* Messages Feed */}
        <MessageList
          messages={currentConversation?.messages}
          onSourceBadgeClick={handleSourceBadgeClick}
          onSuggestionClick={handleSuggestionClick}
        />

        {/* Input Bar Section */}
        <div className="p-4 border-t border-slate-900 bg-slate-950/20">
          <div className="max-w-3xl mx-auto flex flex-col">
            
            {/* Context filter indicators in text area */}
            {activeDocumentNames.length > 0 && (
              <div className="flex items-center space-x-1.5 mb-2 pl-1 animate-stream">
                <span className="text-[10px] font-bold text-indigo-400/80 flex items-center space-x-0.5">
                  <Filter className="w-3 h-3" />
                  <span>Searching:</span>
                </span>
                <div className="flex flex-wrap gap-1">
                  {activeDocumentNames.map((name, i) => (
                    <span 
                      key={i} 
                      className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded text-[9px] text-slate-400 font-semibold"
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Error notifications */}
            {chatError && (
              <div className="mb-3 p-3 rounded-lg border border-red-900/40 bg-red-950/15 text-red-300 text-xs flex items-center space-x-2 animate-stream">
                <Info className="w-4 h-4 shrink-0 text-red-400" />
                <span>{chatError}</span>
              </div>
            )}

            {/* Actual Form container */}
            <div className="relative rounded-xl border border-slate-800 bg-slate-950/60 shadow-xl focus-within:border-indigo-500/50 transition-all duration-200">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={
                  documents.length === 0
                    ? "Upload a document in the sidebar to start asking questions..."
                    : "Ask a question about your indexed context documents..."
                }
                rows={1}
                disabled={documents.length === 0 || isStreaming}
                className="w-full pl-4 pr-12 py-3.5 bg-transparent text-slate-200 placeholder-slate-500 text-[13.5px] leading-relaxed resize-none focus:outline-none min-h-[48px] max-h-[160px] scrollbar-none disabled:opacity-40 disabled:cursor-not-allowed"
              />
              
              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isStreaming || documents.length === 0}
                className="absolute right-2 top-2 p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-900 text-white disabled:text-slate-600 transition-all shadow-md shadow-indigo-950/40 disabled:shadow-none"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            
            <p className="text-[10px] text-slate-600 text-center mt-2 tracking-wide font-medium">
              Powered by Groq Llama 3.3 70B Versatile and BGE Large Embedding Engine.
            </p>

          </div>
        </div>

      </div>

      {/* Sliding source citation Drawer */}
      <SourcePanel
        sources={activeSources}
        isOpen={isSourceDrawerOpen}
        onClose={() => setIsSourceDrawerOpen(false)}
        activePageNumber={activePage}
      />
    </div>
  );
};
