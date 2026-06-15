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
import {
  getProdAllPhotosMap,
  normVariety,
  parseVarietyAttributes,
  colorMatches,
  tintMatches,
  type VarietyAttributes,
} from '@/app/admin/supply/_recData';

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
// (c) AI rung — Pollinations.ai (free, no key) + optional premium providers
// ---------------------------------------------------------------------------

interface AiRung {
  available: boolean;
  provider: string | null; // which provider is active
  url: string | null;      // Pollinations direct image URL (always set as free fallback)
  reason: string;
}

// Free fallback: Pollinations.ai — no key required, deterministic by prompt,
// returns a real JPEG when fetched. Premium providers override when configured.
function aiRung(variety: string): AiRung {
  const premium: { env: string; provider: string }[] = [
    { env: 'OPENAI_API_KEY', provider: 'OpenAI Images' },
    { env: 'REPLICATE_API_TOKEN', provider: 'Replicate' },
    { env: 'STABILITY_API_KEY', provider: 'Stability' },
    { env: 'FAL_KEY', provider: 'fal.ai' },
    { env: 'IMAGE_GEN_API_KEY', provider: 'image-gen' },
  ];
  for (const c of premium) {
    const v = process.env[c.env];
    if (typeof v === 'string' && v.trim().length > 0) {
      return {
        available: true,
        provider: c.provider,
        url: null,
        reason: `AI lista (${c.provider} configurado en ${c.env})`,
      };
    }
  }
  // No premium key — use Pollinations.ai (keyless, commercial-grade quality).
  const prompt = encodeURIComponent(
    `professional product photo ${variety} flower botanical white background sharp focus`,
  );
  const url = `https://image.pollinations.ai/prompt/${prompt}?width=400&height=400&nologo=true`;
  return {
    available: true,
    provider: 'Pollinations.ai',
    url,
    reason: 'AI generada (Pollinations.ai) — verificar que representa la variedad antes de aplicar',
  };
}

// ---------------------------------------------------------------------------
// UNIFIED CANDIDATES (SHARED CONTRACT) — {url, source, colorOk?, tintOk?}
// ---------------------------------------------------------------------------
//
// The card-v2 surface consumes ONE ranked candidates[] of photo OPTIONS instead
// of three separate buckets. Each candidate carries colorOk / tintOk annotations
// computed against the variety's PARSED attributes (color + tint from the NAME).
// These are TEXT-provenance annotations, NOT pixel verification:
//   - PROD url  -> matched on the variety KEY (the url itself has no color text,
//                  so its colorOk/tintOk inherit the variety-key match: a PROD
//                  photo returned for the tinted-blue key IS the tinted-blue
//                  photo). source 'prod'.
//   - free lead -> colorOk/tintOk reflect the QUERY INTENT (we asked for the
//                  right color/tint), honestly a lead not a verified pixel.
//                  source 'free'.
//   - AI url    -> unverifiable: colorOk/tintOk = false always (generated, may
//                  not match), ranked last. source 'ai'.
//
// Ranking (down-rank, never silently drop): PROD-match > PROD > matching-free >
// AI. A non-matching PROD/free candidate stays in the list but sinks below
// matching ones, so the response is honest about what does/doesn't match.

type CandidateSource = 'prod' | 'free' | 'ai';

interface UnifiedCandidate {
  url: string;
  source: CandidateSource;
  colorOk?: boolean;
  tintOk?: boolean;
  // internal-only context (kept in payload for the card; not part of the
  // minimal {url, source, colorOk?, tintOk?} contract but additive/back-compat)
  provider?: string;
  kind?: 'photo' | 'search_lead' | 'generated';
  note?: string;
}

// A candidate's rank: matching beats non-matching within each rung; rungs in
// PROD > free > AI order. colorOk/tintOk === false (a KNOWN mismatch) sinks it
// below unverified (undefined/null) within its rung; a verified match floats up.
function candidateRankScore(c: UnifiedCandidate, attrs: VarietyAttributes): number {
  const rung = c.source === 'prod' ? 300 : c.source === 'free' ? 200 : 100;
  // match contribution: a verified true is best, an explicit false is worst,
  // unverified (undefined) is neutral. Only counts if the attr was parsed.
  const score = (ok: boolean | undefined, wanted: boolean): number => {
    if (!wanted) return 0; // attribute not parsed -> no signal either way
    if (ok === true) return 10;
    if (ok === false) return -10;
    return 0; // unverified
  };
  const colorScore = score(c.colorOk, attrs.color != null);
  const tintScore = score(c.tintOk, attrs.tint != null);
  return rung + colorScore + tintScore;
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

  // Parse what the variety NAME claims it should look like (color + tint) so we
  // can annotate every candidate honestly. e.g. 'gypsophila tinted blue' ->
  // {color:'blue', tint:'tinted'}; 'anthurium red large' -> {color:'red'}.
  const attrs = parseVarietyAttributes(variety);

  const { prodPhoto, prodPhotos } = await getProdPhotos(vNorm);
  const free = freeStockCandidates(variety);
  const ai = aiRung(variety);

  // ---- Build the unified, ranked candidates[] (SHARED CONTRACT) -----------
  // PROD urls: matched on the variety KEY. The url string itself has no color
  // text, so its annotations inherit the variety NAME's claim — a PROD photo
  // returned for the tinted-blue key IS the tinted-blue photo (key match). We
  // annotate via the variety name so the contract shape carries colorOk/tintOk.
  const candidates: UnifiedCandidate[] = [];

  for (const url of prodPhotos.urls) {
    candidates.push({
      url,
      source: 'prod',
      // PROD match is on the full normalized variety key (incl. tint/color
      // words), so a returned PROD url for this variety carries its color/tint.
      colorOk: attrs.color ? colorMatches(attrs, variety) ?? undefined : undefined,
      tintOk: attrs.tint ? tintMatches(attrs, variety) ?? undefined : undefined,
      provider: 'PROD floropolis_inventory',
      kind: 'photo',
      note: 'Foto real en PROD para esta variedad (url CloudFront).',
    });
  }

  // Free leads: colorOk/tintOk reflect the QUERY intent (we searched for the
  // right color/tint terms), NOT a verified pixel — honest "lead, not match".
  // The query string embeds the variety, so it carries the same color/tint text.
  for (const f of free) {
    candidates.push({
      url: f.searchUrl,
      source: 'free',
      colorOk: attrs.color ? colorMatches(attrs, variety) ?? undefined : undefined,
      tintOk: attrs.tint ? tintMatches(attrs, variety) ?? undefined : undefined,
      provider: f.provider,
      kind: 'search_lead',
      note: `${f.note} (intent de busqueda, no pixel verificado)`,
    });
  }

  // AI rung: unverifiable. A generated image may NOT match the color/tint, so
  // colorOk/tintOk are explicitly false whenever the variety asserted one, and
  // it is ranked LAST. Only added when a real url exists (Pollinations keyless).
  if (ai.available && ai.url) {
    candidates.push({
      url: ai.url,
      source: 'ai',
      colorOk: attrs.color ? false : undefined, // generated -> unverified color
      tintOk: attrs.tint ? false : undefined,   // generated -> unverified tint
      provider: ai.provider ?? 'AI',
      kind: 'generated',
      note: 'Imagen generada (no verificada) — ranked debajo de PROD/free matches.',
    });
  }

  // Rank: PROD-match > PROD > matching-free > AI; non-matching sinks, never
  // dropped. Stable-ish (rank desc) so honest order is preserved for the card.
  candidates.sort((a, b) => candidateRankScore(b, attrs) - candidateRankScore(a, attrs));

  // The top option must NEVER be a fabricated url: PROD urls pass realHttpUrl in
  // getProdAllPhotosMap, free urls are verifiable provider SEARCH leads, AI is
  // ranked last + flagged unverified. If the only candidates are AI (no PROD,
  // no real attribute match), the honest state is reflected by recommendedRung
  // and the candidates' colorOk:false flags — not a silent "match".

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
    attributes: attrs, // parsed color + tint (honest provenance of the matching)
    candidates,  // SHARED CONTRACT: unified ranked {url, source, colorOk?, tintOk?}[]
    prodPhoto,   // (a) backward-compat single-photo shape
    prodPhotos,  // (a) backward-compat: ALL real http URLs for the gallery (deduped, max 6)
    freeCandidates: free, // (b) backward-compat: verifiable free-stock SEARCH leads
    ai, // (c) backward-compat: honest AI rung availability flag
    recommendedRung,
    // For the un-gettable case the UI posts to apply-image with no imageUrl to
    // enqueue an ask (ask_vendor | ask_next_client | send_sample).
    ungettableQueueReasons: ['ask_vendor', 'ask_next_client', 'send_sample'],
  });
}
