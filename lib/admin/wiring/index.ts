// Admin wiring registry -- per-page section wiring metadata.
// v1 | 2026-05-19 | Job_PM AI-CPO [V8 SHADOW]
//
// Each admin page declares its major sections + assigns a wiring level:
//   LIVE  = real data + real action (DB writes + audit)
//   READ  = real data, but the action is stubbed (no writeback)
//   MOCK  = placeholder/hardcoded data
//   PLAN  = placeholder space, not built yet
//
// Best-guess assignments derived from a read of each page.tsx (2026-05-19). If
// a section's actual wiring drifts, update the entry here so the CEO review
// overlay stays honest.
//
// Pages keep their sections inlined; the registry is informational + a single
// source of truth for changes. Sections in the registry should match the
// data-wiring-id values on the WiringSection wrappers in the page.

import type { WiringLevel } from '@/components/admin/WiringBadge';

export interface WiringSectionEntry {
  id: string;
  level: WiringLevel;
  note: string;
}

export interface WiringPageEntry {
  page: string;
  pageLabel: string;
  mockupHref: string;
  sections: WiringSectionEntry[];
}

export const ADMIN_WIRING: WiringPageEntry[] = [
  {
    page: '/admin',
    pageLabel: 'Admin index (v2 shell)',
    mockupHref: '/mockups/v2-admin',
    sections: [
      { id: 'today-panel',     level: 'LIVE', note: 'admin_proposals where status=awaiting_facu, top 8 by proposed_at desc; per-row priority badge from payload.urgency_tier; Open button deep-links into approval-queue.' },
      { id: 'kpi-tiles',       level: 'LIVE', note: 'Reused counter queries (catalog_classifications total/publishable, admin_proposals awaiting_facu, orders open, refund_approvals pending, client_profiles pending) -- moved verbatim from W2 /admin index.' },
      { id: 'recent-activity', level: 'LIVE', note: 'Last 5 admin_proposals (any status) by proposed_at desc. Stream expands to executor + audit feed in W4.' },
      { id: 'health-bar',      level: 'MOCK', note: '6 J.x dimension pills hardcoded from the mockup -- awaiting J.x metric queries (Round 3).' },
      { id: 'sidebar',         level: 'LIVE', note: 'Persistent left nav (w-56) across all /admin/* via app/admin/layout.tsx. Active state via usePathname prefix match.' },
      { id: 'command-palette', level: 'LIVE', note: 'Cmd+K / Ctrl+K modal. Server-side autocomplete via POST /api/admin/search (SKU + order ilike). Screen list filtered client-side.' },
    ],
  },
  {
    page: '/admin/catalog',
    pageLabel: 'Catalog list',
    mockupHref: '/mockups/admin-catalog',
    sections: [
      { id: 'summary-tiles', level: 'LIVE', note: 'Collapsed into header subtitle line per mockup (SKUs / vendors / K2K / T2 / T3 / live / hidden / draft / missing-cost / no-box-dims / awaiting-Facu); same floropolis_inventory_mirror counts, no tiles.' },
      { id: 'state-toggle', level: 'MOCK', note: 'Today | Target button group at top right. Today is the only real view; Target is informational with a "Target mode -- coming soon" tooltip (no diverging data path yet).' },
      { id: 'tier-visibility-banner', level: 'LIVE', note: 'tier_visibility_windows read.' },
      { id: 'filter-chips', level: 'LIVE', note: 'Compact single-line chip row grouped by Source / Visibility / Flags; drives URL state.' },
      { id: 'filter-form', level: 'LIVE', note: 'Multi-dimension filter form (vendor/source/category/visibility/GPM/flags). Export CSV button in the form footer streams /api/admin/catalog/export.' },
      { id: 'bulk-actions', level: 'LIVE', note: 'Bulk hide/export/flag-to-CEO via admin_proposals; server-rendered table with override/awaiting badges per SKU.' },
      { id: 'dod-delta', level: 'PLAN', note: 'DoD delta widget awaits mirror_snapshot_daily.' },
    ],
  },
  {
    page: '/admin/catalog/[id]',
    pageLabel: 'SKU detail',
    mockupHref: '/mockups/admin-catalog',
    sections: [
      { id: 'header', level: 'LIVE', note: 'Quality family, vendor, price, status, gate score from mirror + classifications.' },
      { id: 'sources-side-by-side', level: 'PLAN', note: 'Awaits quality_family_id backfill from Rose_BI.' },
      { id: 'cost-breakdown', level: 'LIVE', note: 'Computed from pricing_constants + box_master + farm_cost.' },
      { id: 'audit-timeline', level: 'LIVE', note: 'override_audit rows where target_id = sku_id.' },
      { id: 'gate-status', level: 'LIVE', note: '16-gate panel preserved from v1.' },
      { id: 'raw-mirror', level: 'LIVE', note: 'Direct mirror fields, editable via POST /api/admin/catalog/sku/[id]/update.' },
      { id: 'admin-actions', level: 'LIVE', note: 'catalog_classifications status writes.' },
      { id: 'propose-cluster', level: 'LIVE', note: 'All propose forms POST /api/admin/proposals. Rendered inside DetailActionPanel (sticky right column on desktop, bottom on mobile) as of DETAIL-2COL.' },
      { id: 'right-action-panel', level: 'LIVE', note: 'Sticky right-side DetailActionPanel wrapping the propose-cluster forms (HideSku / DiscountSku / ProposeMirrorField x3 / UnsupportedPropose x2). All endpoints unchanged from inline version.' },
    ],
  },
  {
    page: '/admin/catalog/config',
    pageLabel: 'Catalog config',
    mockupHref: '/mockups/admin-catalog-config',
    sections: [
      { id: 'box-master', level: 'READ', note: 'Read-only per Rose contract; flag-to-CEO writes a rose_queue row.' },
      { id: 'pricing-constants', level: 'LIVE', note: 'Propose -> approve flow via pricing_constants.update.' },
      { id: 'shipping-config', level: 'LIVE', note: 'Propose -> approve flow via shipping_config.create.' },
      { id: 'visibility-windows', level: 'LIVE', note: 'tier_visibility_windows accept toggle gated by 5 pipeline checks.' },
    ],
  },
  {
    page: '/admin/catalog/discounts',
    pageLabel: 'Discounts',
    mockupHref: '/mockups/admin-catalog-discounts',
    sections: [
      { id: 'create-form', level: 'LIVE', note: 'Side-by-side create form posts discount_rule.create proposal with live warnings.' },
      { id: 'pending', level: 'LIVE', note: 'Approve/Reject buttons hit /api/admin/proposals/[id]/{approve,reject}.' },
      { id: 'active-rules', level: 'READ', note: 'Reads discount_rules + discount_applications usage stats. Per-row Pause/Expire button posts a discount_rule.status_change proposal, but the executor is still stubbed (read note on page).' },
    ],
  },
  {
    page: '/admin/catalog/ingest',
    pageLabel: 'Ingest',
    mockupHref: '/mockups/admin-catalog-ingest',
    sections: [
      { id: 'source-badges', level: 'READ', note: 'komet_api + manual_paste are LIVE pipelines; vendor_email/whatsapp/csv_upload are PLANNED adapters (badges show LIVE/PLANNED inline).' },
      { id: 'batch-list', level: 'READ', note: 'ingestion_batches table read with expandable raw_payload vs parsed_rows. Per-row "Approve and route to mapping queue" button is disabled until mapping queue API lands.' },
      { id: 'manual-paste-form', level: 'LIVE', note: 'POST /api/admin/ingest/manual creates an ingestion_batches row with confidence 0.5.' },
    ],
  },
  {
    page: '/admin/catalog/mapping',
    pageLabel: 'SKU mapping',
    mockupHref: '/mockups/admin-catalog-mapping',
    sections: [
      { id: 'tabs', level: 'LIVE', note: 'awaiting_review / low_confidence / mapped / rejected tabs with live counts.' },
      { id: 'mapping-list', level: 'LIVE', note: 'sku_mappings table read. Inline MappingActions per row: Confirm opens a quality_family picker and POSTs admin_proposals (sku_mapping.confirm); Reject hits /api/admin/mapping/[id]/reject directly (reversible).' },
    ],
  },
  {
    page: '/admin/catalog/approval-queue',
    pageLabel: 'Approval queue',
    mockupHref: '/mockups/admin-catalog-approval-queue',
    sections: [
      { id: 'tabs', level: 'LIVE', note: 'awaiting_facu / approved / rejected tabs with counts.' },
      { id: 'rows', level: 'READ', note: 'Reads admin_proposals with cascade_summary pre-computed at proposal creation. Per-row ApproveModal (LIVE - urgency_tier picker writes admin_approvals), RejectModal (LIVE - facu_rationale NOT NULL), audit drill-down (LIVE - override_audit per proposal), Replay button (READ - shows on verification_passed=false but executor wiring varies by proposal type). Filter chips by type and source_agent inside RowsList (LIVE).' },
    ],
  },
  {
    page: '/admin/catalog/proposals',
    pageLabel: 'Proposals (meta)',
    mockupHref: '/mockups/admin-catalog-proposals',
    sections: [
      { id: 'tabs', level: 'LIVE', note: 'Tab state held in ?tab= URL param.' },
      { id: 'specializations', level: 'MOCK', note: 'Hardcoded 15 specializations across 3 phases. Pure CPO informational view.' },
      { id: 'contracts', level: 'MOCK', note: 'Hardcoded agent/contract/table/flow/verifier inventory. No DB writes here.' },
    ],
  },
  {
    page: '/admin/orders',
    pageLabel: 'Orders list',
    mockupHref: '/mockups/admin-orders',
    sections: [
      { id: 'table', level: 'LIVE', note: 'Three tabs (D1 web orders / K2K orders / K2K prebooks). D1 = LIVE from supabase-backup with status filters + customer search + payment_mode. K2K tabs = READ from floropolis-bi Rose pipeline (JOB_READ_OK, no writes). Per-tab CounterTile + FilterForm + FreshnessTile.' },
    ],
  },
  {
    page: '/admin/orders/[id]',
    pageLabel: 'Order detail',
    mockupHref: '/mockups/admin-order-detail',
    sections: [
      { id: 'header', level: 'LIVE', note: 'Order number, status, total, customer.' },
      { id: 'init-dispatch', level: 'LIVE', note: 'Display card on the left (dispatch status). InitDispatchButton moved into right-action-panel as of DETAIL-2COL. POST /api/admin/dispatch/init unchanged.' },
      { id: 'refund-proposal', level: 'READ', note: 'Display card on the left (existing refund_approvals + pending refund proposals). RefundProposalForm trigger moved into right-action-panel as of DETAIL-2COL. Executor for refund.create is a TODO stub today; refund_approvals display is LIVE.' },
      { id: 'right-action-panel', level: 'LIVE', note: 'Sticky right-side DetailActionPanel wrapping InitDispatchButton + RefundProposalForm. All endpoints unchanged (/api/admin/dispatch/init and /api/admin/proposals refund.create).' },
      { id: 'order-lines', level: 'LIVE', note: 'order_lines table read.' },
      { id: 'payments-ledger', level: 'LIVE', note: 'payments table read.' },
      { id: 'timeline', level: 'LIVE', note: 'Derived from orders.* timestamps + payments ledger.' },
      { id: 'addresses', level: 'LIVE', note: 'shipping/billing snapshot jsonb with addresses-row fallback.' },
      { id: 'invoice', level: 'LIVE', note: 'invoices.pdf_url signed link or download proxy.' },
      { id: 'email-log', level: 'LIVE', note: 'Brevo /v3/smtp/statistics/events filtered by recipient + order tag/subject. Server component (EmailLogSection) degrades to a friendly placeholder when BREVO_API_KEY is unset; the LIVE badge represents wired, not data-present.' },
      { id: 'conversations', level: 'LIVE', note: 'dispatch_communications (joined via dispatches.order_id) + Brevo events interleaved DESC by timestamp. Server component (ConversationsSection). LIVE = wired; Brevo subset degrades gracefully when key unset.' },
    ],
  },
  {
    page: '/admin/dispatch',
    pageLabel: 'Dispatch',
    mockupHref: '/mockups/admin-dispatch',
    sections: [
      { id: 'date-nav', level: 'LIVE', note: 'Prev / today / next date picker drives ?date=YYYY-MM-DD which filters the manifest by dispatches.dispatch_date (fallback: derived ship date). Mon/Tue/Thu/Fri primary; weekends skipped in nav buttons, still selectable via calendar input.' },
      { id: 'pipeline-widget', level: 'LIVE', note: 'Derived stage counts only; widget is display-only, no write actions. Includes box-count-pill subsection.' },
      { id: 'box-count-pill', level: 'LIVE', note: 'Sum of boxesCount (derived: ceil(totalQty / 125)) across non-shipped rows whose dispatch_date matches the active date. Emerald >=2, amber <2. No new query — reuses the same orders+dispatches join feeding the manifest.' },
      { id: 'manifest-table', level: 'LIVE', note: 'orders + dispatches joined per row. Inline cells: Communications (READ - dispatch_communications log only, outbound email still through n8n), Labels (LIVE - upload + signed URL + driver/FedEx confirm writeable), Actions (LIVE - status transitions + tracking via /api/admin/dispatch/*), Feedback (LIVE - per-SKU delivery feedback). FedEx CSV export + Sample Box modal in the page header (Sample Box backend partial).' },
    ],
  },
  {
    page: '/admin/refunds',
    pageLabel: 'Refunds',
    mockupHref: '/mockups/admin-order-detail',
    sections: [
      { id: 'counters', level: 'LIVE', note: 'Pending count + ready-to-execute count.' },
      { id: 'approval-list', level: 'LIVE', note: 'refund_approvals table read. Per-row JJ + Facu vote grid + Vote/Execute actions all wired to /api/admin/refunds/*.' },
    ],
  },
  {
    page: '/admin/clients',
    pageLabel: 'Clients list',
    mockupHref: '/mockups/v2-admin',
    sections: [
      { id: 'counters', level: 'LIVE', note: 'Six counter tiles from client_profiles aggregates.' },
      { id: 'filters', level: 'LIVE', note: 'Status chips + B2B chips + date range + search.' },
      { id: 'bulk-approve', level: 'LIVE', note: 'BulkApproveForm creates per-user proposals.' },
      { id: 'table', level: 'LIVE', note: 'Joins emails (RPC) + orders aggregate per user. Inline Approve/Reject buttons create awaiting_facu proposals.' },
    ],
  },
  {
    page: '/admin/clients/[id]',
    pageLabel: 'Client detail',
    mockupHref: '/mockups/v2-admin',
    sections: [
      { id: 'header', level: 'LIVE', note: 'Business name, status, role, email, phone, member since. ActionButtons (Approve / Suspend / Promote / Force-logout) moved into right-action-panel as of DETAIL-2COL.' },
      { id: 'tabs', level: 'READ', note: 'ClientDetailTabs wraps 4 tabs: Profile (LIVE - editable fields routed through proposals), Orders (LIVE - orders by user_id), Communications (READ - dispatch_communications + phone notes; Brevo degrades gracefully), Audit (LIVE - override_audit). Mixed-level surface; communications is the weakest.' },
      { id: 'right-action-panel', level: 'LIVE', note: 'Sticky right-side DetailActionPanel wrapping ActionButtons (Approve / Suspend / Unsuspend / Promote / Force-logout). Approve / Suspend / Promote route through admin_proposals; Force-logout hits /api/admin/auth-sessions/[user_id]/force-logout directly.' },
    ],
  },
];

export function getWiringForPage(page: string): WiringPageEntry | undefined {
  return ADMIN_WIRING.find((p) => p.page === page);
}

export function countByLevel(): Record<WiringLevel, number> {
  const out: Record<WiringLevel, number> = { LIVE: 0, READ: 0, MOCK: 0, PLAN: 0 };
  for (const p of ADMIN_WIRING) {
    for (const s of p.sections) out[s.level] += 1;
  }
  return out;
}
