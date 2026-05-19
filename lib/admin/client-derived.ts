// lib/admin/client-derived.ts
// Phase E | 2026-05-19 | Job_PM admin-clients [V8 SHADOW]
//
// Derived fields for client_profiles rows. Centralized so the list view, the
// detail view, the export CSV, and any future surface all derive identically.
//
// Why a JS helper rather than a Postgres GENERATED ALWAYS column:
//   - BRD v0.3 specifies a GENERATED column, but generated columns in pg17
//     are STORED-only, immutable, cannot reference other tables, and would
//     require a NOT VALID + revalidate dance to backfill. Doing it here in JS
//     keeps the logic readable, testable, and consistent with how /admin/orders
//     derives status badges today.
//   - The Postgres-side rule is still applied for any future B2B view if we
//     need to push it down -- see the b2b_status_logic doc comment below.
//
// b2b_status_logic:
//   ein IS NOT NULL AND length(ein) >= 9  => 'B2B'
//   else                                    => 'B2C'
// (CEO verbatim: "B2c if they haven't added their EIN and hence have to pay
// state sales tax". BRD v0.3 lines 4244-4250.)

export type B2BStatus = 'B2B' | 'B2C';
export type ClientRole = 'florist' | 'sales' | 'admin';
export type ClientStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'admin'
  | 'suspended';

export interface ClientProfileRowMinimal {
  ein: string | null;
  role?: string | null;
  status?: string | null;
}

export function deriveB2BStatus(ein: string | null | undefined): B2BStatus {
  if (typeof ein !== 'string') return 'B2C';
  const trimmed = ein.trim();
  if (trimmed.length < 9) return 'B2C';
  return 'B2B';
}

export function normalizeRole(role: string | null | undefined): ClientRole {
  if (role === 'admin' || role === 'sales' || role === 'florist') return role;
  return 'florist';
}

export function normalizeStatus(s: string | null | undefined): ClientStatus {
  if (
    s === 'pending' ||
    s === 'approved' ||
    s === 'rejected' ||
    s === 'admin' ||
    s === 'suspended'
  ) {
    return s;
  }
  // Default unknowns to 'pending' so we never silently treat a typo as approved.
  return 'pending';
}
