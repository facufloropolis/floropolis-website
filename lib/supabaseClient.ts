/**
 * Supabase REST API client for read-only catalog access.
 * Uses fetch + anon key (no @supabase/supabase-js to avoid Next.js 15 module issues).
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set.",
  );
}

const defaultHeaders: HeadersInit = {
  apikey: supabaseAnonKey ?? "",
  Authorization: `Bearer ${supabaseAnonKey ?? ""}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

/**
 * GET /rest/v1/floropolis_inventory with optional query params.
 */
export async function supabaseFetchInventory(
  queryParams: Record<string, string> = {},
): Promise<unknown[]> {
  if (!supabaseUrl || !supabaseAnonKey) return [];

  const search = new URLSearchParams(queryParams).toString();
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/floropolis_inventory${search ? `?${search}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: defaultHeaders,
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error("[supabase] REST error", res.status, await res.text());
    return [];
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
