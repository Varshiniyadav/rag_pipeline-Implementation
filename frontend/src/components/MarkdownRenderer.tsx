import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {

  return (
    <div className="prose prose-invert max-w-none prose-slate prose-p:leading-relaxed prose-pre:bg-slate-950/80 prose-pre:border prose-pre:border-slate-800/80 prose-th:text-slate-200 prose-td:text-slate-300">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Custom styling override for markdown HTML tags
          p: ({ node, ...props }) => <p className="mb-3 text-[14.5px] leading-relaxed text-slate-200" {...props} />,
          h1: ({ node, ...props }) => <h1 className="text-xl font-bold text-slate-100 mt-4 mb-2 font-outfit" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-lg font-bold text-slate-200 mt-3 mb-2 font-outfit" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-md font-semibold text-slate-300 mt-2 mb-1 font-outfit" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-3 space-y-1 text-slate-300" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-slate-300" {...props} />,
          li: ({ node, ...props }) => <li className="text-[14px]" {...props} />,
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4 rounded-lg border border-slate-800/80">
              <table className="min-w-full divide-y divide-slate-800" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => <thead className="bg-slate-900/60" {...props} />,
          tbody: ({ node, ...props }) => <tbody className="divide-y divide-slate-800/50 bg-slate-950/20" {...props} />,
          tr: ({ node, ...props }) => <tr className="hover:bg-slate-900/20 transition-colors" {...props} />,
          th: ({ node, ...props }) => <th className="px-4 py-2 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider" {...props} />,
          td: ({ node, ...props }) => <td className="px-4 py-2 text-sm text-slate-300 whitespace-pre-wrap" {...props} />,
          code: ({ node, inline, className, children, ...props }: any) => {
            return !inline ? (
              <pre className="p-3 my-3 overflow-x-auto rounded-lg font-mono text-xs bg-slate-950/80 border border-slate-800/80">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            ) : (
              <code className="px-1.5 py-0.5 rounded text-xs font-mono bg-slate-950 text-indigo-300 border border-slate-800" {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
