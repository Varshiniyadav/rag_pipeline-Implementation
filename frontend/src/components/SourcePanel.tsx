import React from 'react';
import { X, FileText, CheckCircle2, Bookmark } from 'lucide-react';
import { SourceChunk } from '../types';

interface SourcePanelProps {
  sources: SourceChunk[];
  isOpen: boolean;
  onClose: () => void;
  activePageNumber?: number | null;
}

export const SourcePanel: React.FC<SourcePanelProps> = ({ sources, isOpen, onClose, activePageNumber }) => {
  // Convert BGE cross-encoder scores (often range from -10 to 10 or similar) to percentage display
  const formatRelevanceScore = (score: number) => {
    // If score is already 0.0 - 1.0
    if (score >= 0 && score <= 1) {
      return `${Math.round(score * 100)}%`;
    }
    // For standard logits, soft squeeze to positive percentage
    const probability = 1 / (1 + Math.exp(-score));
    return `${Math.round(probability * 100)}%`;
  };

  return (
    <div
      className={`fixed top-0 right-0 h-full w-[450px] max-w-full glass-panel-heavy border-l border-slate-800 z-50 transform transition-transform duration-300 ease-out shadow-2xl ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center space-x-2">
            <Bookmark className="w-5 h-5 text-indigo-400" />
            <h2 className="text-md font-bold text-slate-100 font-outfit">Verification Sources</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {sources.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center text-slate-500">
              <FileText className="w-10 h-10 mb-2 opacity-50" />
              <p className="text-sm">No source attributions available for this response.</p>
            </div>
          ) : (
            sources.map((source, index) => {
              const isActive = activePageNumber === source.page_number;
              return (
                <div
                  key={index}
                  className={`p-4 rounded-xl glass-card transition-all duration-200 ${
                    isActive
                      ? 'border-indigo-500/40 bg-indigo-950/15 shadow-lg shadow-indigo-950/20'
                      : 'border-slate-800/60'
                  }`}
                >
                  {/* Meta Details */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center space-x-2 min-w-0">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="text-xs font-semibold text-slate-200 truncate" title={source.source_filename}>
                        {source.source_filename}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0">
                      <span className="px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase rounded bg-indigo-950 text-indigo-300 border border-indigo-900/60">
                        Page {source.page_number || '?' }
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-950 text-emerald-300 border border-emerald-900/40 flex items-center space-x-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                        <span>Match: {formatRelevanceScore(source.relevance_score)}</span>
                      </span>
                    </div>
                  </div>

                  {/* Section Title if exists */}
                  {source.section_title && (
                    <div className="text-[11px] font-medium text-indigo-300/80 mb-2 truncate">
                      Section: {source.section_title}
                    </div>
                  )}

                  {/* Source snippet text */}
                  <div className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-3 rounded-lg border border-slate-900 overflow-y-auto max-h-[160px] whitespace-pre-wrap font-mono">
                    {source.text}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
