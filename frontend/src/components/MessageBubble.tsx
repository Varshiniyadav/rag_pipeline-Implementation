import React from 'react';
import { MessageSquare, Cpu, Bookmark } from 'lucide-react';
import { ChatMessage, SourceChunk } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MessageBubbleProps {
  message: ChatMessage;
  onSourceBadgeClick: (sources: SourceChunk[], pageNumber: number | null) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onSourceBadgeClick }) => {
  const isUser = message.role === 'user';
  const hasSources = message.sources && message.sources.length > 0;

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'} mb-6 animate-stream`}>
      <div className={`flex gap-3 max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        
        {/* Avatar */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
          isUser 
            ? 'bg-indigo-600/20 border-indigo-500/30 text-indigo-400' 
            : 'bg-slate-900 border-slate-800 text-indigo-400'
        }`}>
          {isUser ? <MessageSquare className="w-4 h-4" /> : <Cpu className="w-4 h-4" />}
        </div>

        {/* Message body */}
        <div className="flex flex-col">
          <div
            className={`px-4 py-3 rounded-2xl ${
              isUser
                ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-tr-none shadow-md shadow-indigo-950/20 border border-indigo-500/30'
                : 'glass-panel rounded-tl-none border-slate-800/80 text-slate-100'
            }`}
          >
            {/* If assistant is thinking and has no text content yet */}
            {!isUser && !message.content && message.isStreaming ? (
              <div className="space-y-2.5 py-1 w-[200px] sm:w-[350px]">
                <div className="h-3 shimmer-placeholder rounded w-3/4"></div>
                <div className="h-3 shimmer-placeholder rounded w-full"></div>
                <div className="h-3 shimmer-placeholder rounded w-5/6"></div>
              </div>
            ) : (
              <div className={!isUser && message.isStreaming ? 'after:content-["▋"] after:ml-0.5 after:text-indigo-400 after:animate-pulse' : ''}>
                <MarkdownRenderer content={message.content} />
              </div>
            )}
          </div>

          {/* Citation Badges (Only for Assistant messages with loaded sources) */}
          {!isUser && hasSources && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2 ml-1">
              <span className="text-[10px] font-bold text-slate-500 flex items-center space-x-1 uppercase tracking-wider mr-1">
                <Bookmark className="w-3 h-3" />
                <span>Citations:</span>
              </span>
              {message.sources!.map((source, idx) => (
                <button
                  key={idx}
                  onClick={() => onSourceBadgeClick(message.sources!, source.page_number || null)}
                  className="px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-900/60 hover:bg-slate-800 border border-slate-800/80 hover:border-slate-700 text-indigo-300 transition-colors flex items-center space-x-1"
                >
                  <span className="truncate max-w-[80px]" title={source.source_filename}>
                    {source.source_filename}
                  </span>
                  <span className="text-slate-500 font-normal">|</span>
                  <span className="font-bold">P.{source.page_number || '?'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
