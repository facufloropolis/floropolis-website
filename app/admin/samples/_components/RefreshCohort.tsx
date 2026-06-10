'use client';

// Refresh button for the samples surface. When JJ inserts MORE qualified accounts
// (zoho_accounts.sb_qualif_by_jj=true + a FLORA score) they flow into v_flora_cohort
// automatically; this button re-pulls the page (cohort + approved-labels) so the new
// ones appear without losing the session. Full reload = bulletproof for tomorrow's run.
// v1 | 2026-06-10 | Job_PM (CPO)

import { useState } from 'react';

export default function RefreshCohort() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        setBusy(true);
        window.location.reload();
      }}
      disabled={busy}
      className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
      title="Volver a leer las calificadas por JJ (ver las que recien inserto) y las aprobadas"
    >
      <span aria-hidden>{busy ? '...' : '↻'}</span>
      Refrescar &mdash; ver nuevas de JJ
    </button>
  );
}
