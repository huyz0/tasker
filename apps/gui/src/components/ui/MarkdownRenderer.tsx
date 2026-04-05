import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  return (
    <div className={`prose prose-sm dark:prose-invert max-w-none ${className || ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          // Optional: Override specific element styling here using Tailwind
          a: ({ ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700 underline" />
          ),
          code: ({ ...props }) => (
            <code {...props} className="bg-muted px-1.5 py-0.5 rounded-md font-mono text-sm" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
