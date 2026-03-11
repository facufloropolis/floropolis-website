"use client";

import ReactMarkdown from "react-markdown";

export default function BlogContent({ content }: { content: string }) {
  return (
    <div className="prose prose-slate prose-lg max-w-none prose-headings:font-bold prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3 prose-p:text-slate-700 prose-p:leading-relaxed prose-li:text-slate-700 prose-strong:text-slate-900 prose-a:text-emerald-600 prose-a:no-underline hover:prose-a:underline prose-table:text-sm prose-th:bg-slate-100 prose-th:px-4 prose-th:py-2 prose-td:px-4 prose-td:py-2 prose-td:border-t prose-hr:my-8">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
