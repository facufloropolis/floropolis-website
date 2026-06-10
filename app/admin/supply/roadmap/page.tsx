// Supply — "Cómo lo mejoramos" (the improvement plan, in admin).
// v1 | 2026-06-10 | Job_PM (CPO)
//
// Rendered VIEW of the canonical plan. SOURCE OF TRUTH:
//   Job_PM/kb/supply_solution_rituals_proposal_2026-06-10.md (Claude_MA_v8).
// This page mirrors its summary so the plan is reachable from the Supply tab.
// Auth mirrors /admin/supply.

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

export const metadata = { title: 'Supply — cómo lo mejoramos | Floropolis Admin', robots: { index: false, follow: false } };

function Pill({ tone, children }: { tone: 'live' | 'build'; children: React.ReactNode }) {
  const cls =
    tone === 'live'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{children}</span>;
}

export default async function SupplyRoadmapPage() {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) redirect('/');
  const emailLc = (user.email ?? '').toLowerCase();
  if (!ADMIN_EMAILS.includes(emailLc)) {
    const { data: profile } = await getBackupServiceClient().from('client_profiles').select('status').eq('user_id', user.id).maybeSingle();
    if (!profile || profile.status !== 'admin') redirect('/');
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <nav className="mb-3 text-xs text-slate-500">
        <Link href="/admin/supply" className="hover:text-emerald-700">Supply</Link>
        <span className="mx-1.5">/</span>
        <span className="font-medium text-slate-700">Cómo lo mejoramos</span>
      </nav>

      <h1 className="text-2xl font-bold text-slate-900">Supply — cómo lo mejoramos</h1>
      <p className="mt-1 text-[13px] text-slate-500">
        Plan de mejora del motor de Supply. Fuente canónica:{' '}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">Job_PM/kb/supply_solution_rituals_proposal_2026-06-10.md</code> (v2).
      </p>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-slate-800">El principio</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
          TRABAJAR la solución, no presentar el problema. El loop cierra SOLO cuando la métrica se mueve
          (variedad desbloqueada / calidad↑) — inform+confirm es perder el tiempo. Resolver a ESCALA
          (vendor×caja, categoría, batch), nunca SKU-por-SKU. Aprender de los picks de Facu.
        </p>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-slate-800">Estado (post-deploy 2026-06-10)</h2>
        <div className="mt-2 space-y-2 text-[13px] text-slate-600">
          <p><Pill tone="live">LIVE</Pill> Lever de imágenes que APLICA (foto real → gate limpio → image_count 0→1 = métrica movida) · image_improve A/B · dims a escala vendor×caja · content-inference de siblings (null honesto) · filtro por 5 levers · los 4 loops de mejora (re-rank que aprende · priorización por outcome · agrupar batch · panel Loop&Learning).</p>
          <p><Pill tone="build">A CONSTRUIR</Pill> Automatización en crons cloud (image-ladder nightly · content-inference job · scale-grouping job · research-con-Talin, orquestados por Nahua) · executors reales de content/fulfillment (hoy "triage") · que la view de Rose shippee learned_delta (hoy lo computo en el reader) · loop-closure metric acumula con el uso · AI image gen (destrabar API) · fuente client-photos.</p>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-sm font-bold text-slate-800">Los rituales (cómo trabajamos las soluciones)</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-slate-600">
          <li><b>Detectar + agrupar a escala</b> (Rose + Job) — por vendor×caja / categoría + batch de repetidos.</li>
          <li><b>Imágenes (ladder)</b> — subagente de sourcing: PROD → free → AI → cola (vendor/cliente/sample); Facu elige; aprende.</li>
          <li><b>Contenido (inferencia)</b> — de siblings de categoría + ejemplos comparativos + qué caja.</li>
          <li><b>Research</b> — competitor_prices + external_profile + Talin (market intel).</li>
          <li><b>Priorizar</b> — re-rank por impacto 3-dim + lo aprendido.</li>
          <li><b>Revisar + elegir</b> — Facu, en admin → se aplica → loop cierra cuando la métrica se mueve.</li>
          <li><b>Aprender</b> — picks/outcomes mejoran tipo/contexto/orden de la próxima rec (loop-closure-rate).</li>
          <li><b>Reflexión semanal</b> — Pablito (Ritual de Efectividad); Job trae findings; qué destrabar.</li>
        </ol>
      </section>

      <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-5">
        <h2 className="text-sm font-bold text-emerald-800">El MVP a validar (¿vale el lío?)</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-700">
          Probar el ciclo end-to-end real en imágenes (sin crons/AI/orquestación full): elegís una foto → se aplica →
          la métrica se mueve → los loops de mejora se acomodan. <b>Criterio:</b> (a) candidatas reales y útiles,
          (b) elegir mueve la métrica, (c) se nota que mejora. Si da ✅ → construir la automatización full.
        </p>
      </section>

      <div className="mt-6">
        <Link href="/admin/supply" className="text-sm font-medium text-emerald-700 hover:underline">← Volver a Supply</Link>
      </div>
    </main>
  );
}
