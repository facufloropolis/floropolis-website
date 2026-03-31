"use client";
import ReactMarkdown from "react-markdown";

export default function MarkdownRenderer({ content }: { content: string }) {
  return (
    <article className="prose prose-slate prose-lg max-w-none
      prose-headings:font-bold prose-headings:text-slate-900
      prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
      prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
      prose-p:text-slate-700 prose-p:leading-relaxed
      prose-li:text-slate-700
      prose-strong:text-slate-900
      prose-a:text-emerald-600 prose-a:no-underline hover:prose-a:underline
      prose-hr:border-slate-200">
      <ReactMarkdown>{content}</ReactMarkdown>
    </article>
  );
}
