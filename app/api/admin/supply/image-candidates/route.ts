// GET /api/admin/supply/image-candidates?variety=<variety>
// v1 | 2026-06-10 | Job_PM (CPO)
//
// The IMAGE solution, WORKED (not flagged): returns real, rankable candidate
// images for a variety across the sourcing ladder so Facu can PICK one (the
// pick is applied via /api/admin/supply/apply-image, which moves the metric).
//
// Three rungs, in priority order, REAL data only (honest 'pending' when empty):
//   (a) PROD photo  -> the REAL CloudFront http url already on record in PROD
//       floropolis_inventory.images for this variety (self-contained, best).
//   (b) free stock  -> candidate urls from reputable FREE stock sources, built
//       from the variety query. We return the SEARCH urls + provider so a human
//       (or a downstream fetch) can pick; we do NOT auto-pick and do NOT claim a
//       specific photo is "the" photo. These are leads, labeled as such.
//   (c) AI rung     -> probe env for an image-gen API key. If configured, expose
//       it as available + which provider; if NOT, return an HONEST flag
//       { available:false, reason:'needs image API: set <ENV>' } — no fake url.
//
// HARD BAR: no fabrication. The PROD rung returns the real url or nothing. The
// free rung returns provider SEARCH urls (verifiable leads), never an invented
// hosted photo. The AI rung never returns an image unless a key is wired.
// NULL-safe: PROD unreachable -> prodPhoto.state='unknown', never throws.
//
// Auth mirrors /api/admin/supply/decide (ADMIN_EMAILS or client_profiles.status).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createBackupServerClient as createUserClient } from '@/lib/supabase/backup-server-session';
import { getBackupServiceClient } from '@/lib/supabase/backup-server';
import { getProdAllPhotosMap, normVariety } from '@/app/admin/supply/_recData';

const ADMIN_EMAILS = [
  'facu@floropolis.com',
  'jjpj@crescoinversiones.com',
  'jjpj@floropolis.com',
  'jjp@floropolis.com',
];

interface AuthOk { ok: true; userId: string; email: string }
interface AuthFail { ok: false; response: NextResponse }

async function requireAdmin(): Promise<AuthOk | AuthFail> {
  const userClient = await createUserClient();
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  }
  const emailLc = (user.email ?? '').toLowerCase();
  if (ADMIN_EMAILS.includes(emailLc)) return { ok: true, userId: user.id, email: emailLc };
  const adminClient = getBackupServiceClient();
  const { data: profile } = await adminClient
    .from('client_profiles')
    .select('status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profile?.status === 'admin') return { ok: true, userId: user.id, email: emailLc };
  return { ok: false, response: NextResponse.json({ error: 'not_admin' }, { status: 403 }) };
}

// ---------------------------------------------------------------------------
// (a) PROD photo(s)
// ---------------------------------------------------------------------------

interface ProdPhoto {
  state: 'yes' | 'no' | 'unknown';
  url: string | null; // first URL for backward compat
}

interface ProdPhotos {
  state: 'yes' | 'no' | 'unknown';
  urls: string[]; // all available real http URLs (deduped, max 6)
}

async function getProdPhotos(vNorm: string): Promise<{ prodPhoto: ProdPhoto; prodPhotos: ProdPhotos }> {
  let allMap: Map<string, string[]> | null;
  try {
    allMap = await getProdAllPhotosMap();
  } catch {
    allMap = null;
  }
  if (allMap === null) {
    return {
      prodPhoto: { state: 'unknown', url: null },
      prodPhotos: { state: 'unknown', urls: [] },
    };
  }
  const urls = allMap.get(vNorm) ?? [];
  if (urls.length === 0) {
    return {
      prodPhoto: { state: 'no', url: null },
      prodPhotos: { state: 'no', urls: [] },
    };
  }
  return {
    prodPhoto: { state: 'yes', url: urls[0] },
    prodPhotos: { state: 'yes', urls },
  };
}

// ---------------------------------------------------------------------------
// (b) free stock candidates (leads, not auto-picked)
// ---------------------------------------------------------------------------

interface FreeCandidate {
  provider: string; // Unsplash | Pexels | Pixabay | Wikimedia
  searchUrl: string; // verifiable query url a human can open / a fetcher can scrape
  license: string; // the FREE license terms (honest)
  note: string;
}

// Reputable FREE stock sources. We return their query URLs for "<variety> rose
// flower" so the lead is verifiable and license-honest. We deliberately do NOT
// fabricate a direct hosted-photo url (that would be inventing a photo).
function freeStockCandidates(variety: string): FreeCandidate[] {
  const q = encodeURIComponent(`${variety} rose flower`);
  return [
    {
      provider: 'Unsplash',
      searchUrl: `https://unsplash.com/s/photos/${q}`,
      license: 'Unsplash License (free, commercial use, no attribution required)',
      note: 'Buscar foto real de la variedad; elegir manualmente antes de aplicar',
    },
    {
      provider: 'Pexels',
      searchUrl: `https://www.pexels.com/search/${q}/`,
      license: 'Pexels License (free, commercial use)',
      note: 'Lead de stock libre; verificar que es la variedad antes de aplicar',
    },
    {
      provider: 'Pixabay',
      searchUrl: `https://pixabay.com/images/search/${q}/`,
      license: 'Pixabay Content License (free, commercial use)',
      note: 'Lead de stock libre; verificar variedad',
    },
    {
      provider: 'Wikimedia Commons',
      searchUrl: `https://commons.wikimedia.org/w/index.php?search=${q}&title=Special:MediaSearch&type=image`,
      license: 'CC / public domain (revisar licencia por archivo)',
      note: 'Fotos botanicas; verificar licencia por archivo',
    },
  ];
}

// ---------------------------------------------------------------------------
// (c) AI rung — honest env probe
// ---------------------------------------------------------------------------

interface AiRung {
  available: boolean;
  provider: string | null; // which key we found, if any
  reason: string; // honest: how to unlock when unavailable
}

// Probe for any configured image-gen API key. None are set today -> we report
// the rung as available-but-needs-API (honest), never a fake generated url.
function aiRung(): AiRung {
  const candidates: { env: string; provider: string }[] = [
    { env: 'OPENAI_API_KEY', provider: 'OpenAI Images' },
    { env: 'REPLICATE_API_TOKEN', provider: 'Replicate' },
    { env: 'STABILITY_API_KEY', provider: 'Stability' },
    { env: 'FAL_KEY', provider: 'fal.ai' },
    { env: 'IMAGE_GEN_API_KEY', provider: 'image-gen' },
  ];
  for (const c of candidates) {
    const v = process.env[c.env];
    if (typeof v === 'string' && v.trim().length > 0) {
      return {
        available: true,
        provider: c.provider,
        reason: `AI rung lista (${c.provider} configurado en ${c.env})`,
      };
    }
  }
  const envList = candidates.map((c) => c.env).join(' | ');
  return {
    available: false,
    provider: null,
    reason: `AI rung disponible: falta image API. Setear una de: ${envList}`,
  };
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const variety = (req.nextUrl.searchParams.get('variety') ?? '').trim().slice(0, 200);
  if (!variety) {
    return NextResponse.json({ error: 'invalid_variety' }, { status: 400 });
  }
  const vNorm = normVariety(variety);
  if (!vNorm) {
    return NextResponse.json({ error: 'invalid_variety' }, { status: 400 });
  }

  const { prodPhoto, prodPhotos } = await getProdPhotos(vNorm);
  const free = freeStockCandidates(variety);
  const ai = aiRung();

  // The recommended next rung, framed as WORK (not a flag): prod if real photo
  // exists (one-click apply), else free leads, else AI when wired, else the
  // un-gettable path (queue an ask_vendor / send_sample request).
  const recommendedRung =
    prodPhotos.state === 'yes'
      ? 'prod_photo'
      : free.length > 0
        ? 'free_stock'
        : ai.available
          ? 'ai_gen'
          : 'queue_request';

  return NextResponse.json({
    variety,
    prodPhoto,   // (a) backward-compat single-photo shape
    prodPhotos,  // (a) new: ALL real http URLs for the gallery (deduped, max 6)
    freeCandidates: free, // (b) verifiable free-stock SEARCH leads
    ai, // (c) honest AI rung availability flag
    recommendedRung,
    // For the un-gettable case the UI posts to apply-image with no imageUrl to
    // enqueue an ask (ask_vendor | ask_next_client | send_sample).
    ungettableQueueReasons: ['ask_vendor', 'ask_next_client', 'send_sample'],
  });
}
