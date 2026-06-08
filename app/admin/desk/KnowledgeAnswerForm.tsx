// Inline capture for a Zone 3 knowledge question on Facu's Desk.
// v1 | 2026-06-08 | Job_PM (CPO)
//
// Posts the answer to /api/admin/desk/answer, which routes it to the governed
// admin_proposals queue (type 'facu_knowledge_answer'). Small, non-intrusive:
// a textarea + Save, with a "saved" stamp on success. No page redesign.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  questionKey: string;
  question: string;
}

export default function KnowledgeAnswerForm({ questionKey, question }: Props) {
  const router = useRouter();
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (answer.trim().length < 1) {
      setError('Type an answer first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/desk/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question_key: questionKey, question, answer: answer.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.detail ? `${json.error}: ${json.detail}` : (json.error ?? `HTTP ${res.status}`));
      }
      setSaved(true);
      setAnswer('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Your answer
      </label>
      <textarea
        value={answer}
        onChange={(e) => {
          setAnswer(e.target.value);
          if (saved) setSaved(false);
        }}
        rows={2}
        placeholder="answer (routes to the governed proposals queue)"
        className="mt-1 w-full text-sm rounded-md border border-slate-200 px-2 py-1.5 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <div className="flex items-center gap-2 mt-1">
        <button
          type="button"
          disabled={busy}
          onClick={save}
          className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Save answer'}
        </button>
        {saved && (
          <span className="text-[11px] text-emerald-700 font-medium inline-flex items-center gap-1">
            <span aria-hidden>&#10003;</span> saved to proposals queue
          </span>
        )}
        {error && <span className="text-[11px] text-red-600 font-mono">{error}</span>}
      </div>
    </div>
  );
}
