import React, { useEffect, useRef } from 'react';
import { Sparkles, MessageSquare, Terminal } from 'lucide-react';
import { ChatMessage, SourceChunk } from '../types';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages?: ChatMessage[];
  onSourceBadgeClick: (sources: SourceChunk[], pageNumber: number | null) => void;
  onSuggestionClick: (text: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({ messages = [], onSourceBadgeClick, onSuggestionClick }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, messages[messages.length - 1]?.content]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        {/* Empty / Welcome State */}
        <div className="max-w-md p-8 rounded-2xl glass-panel border-slate-800/80 animate-float-slow shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-4 border border-indigo-400/20 shadow-lg shadow-indigo-950/40">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          
          <h2 className="text-xl font-bold text-slate-100 font-outfit mb-2">Enterprise RAG Workspace</h2>
          <p className="text-xs text-slate-400 leading-relaxed mb-6">
            Upload business records, reports, or research sheets to extract layout-aware text. Ask natural language questions below, and retrieve answers indexed with verifiable source references.
          </p>

          <div className="space-y-2 text-left">
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-1 mb-1.5 flex items-center space-x-1">
              <Terminal className="w-3 h-3" />
              <span>Suggested Queries</span>
            </h3>
            
            {[
              "Summarize the key findings in this document",
              "What are the main timelines and dates specified?",
              "Are there any exact tables or numerical breakdowns?",
            ].map((text, idx) => (
              <button
                key={idx}
                onClick={() => onSuggestionClick(text)}
                className="w-full text-left px-3 py-2 rounded-lg bg-slate-950/60 hover:bg-slate-900 border border-slate-900/60 hover:border-slate-800 text-xs text-slate-300 hover:text-indigo-300 transition-all flex items-center space-x-2"
              >
                <MessageSquare className="w-3.5 h-3.5 text-indigo-400/60 shrink-0" />
                <span className="truncate">{text}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          onSourceBadgeClick={onSourceBadgeClick}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
};
