// Admin catalog -- Proposals (folded into Approvals).
// v3 | 2026-06-08 | Job_PM admin-surface-consolidation
//
// Proposals is no longer a separate surface. The full proposal history now
// lives inside the Approvals (approval-queue) page as its Approved/Rejected
// tabs. This route is kept as a permanent redirect so existing bookmarks and
// inbound links survive (no 404). The approval-queue page reads a `status`
// search param (awaiting_facu | approved | rejected); we send history-seekers
// straight to the Approved tab.

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Proposals | Floropolis Admin',
  robots: { index: false, follow: false },
};

export default function AdminCatalogProposalsPage() {
  redirect('/admin/catalog/approval-queue?status=approved');
}
