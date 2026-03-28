// Admin Client Queue — v1 | 2026-03-23 | Job_PM
// Server component. Shows all client signups with approve/reject actions.
// Access: facu@floropolis.com only (enforced via middleware + server-side check).
// TODO: Getting user email requires service role key or a Supabase RPC function.
//       For now we show business_name, phone, status, created_at, user_id.
//       To add email: create a Supabase function that joins auth.users — or use service role.

export const dynamic = 'force-dynamic';

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Navigation from "@/components/Navigation";
import TopBanner from "@/components/TopBanner";
import Footer from "@/components/Footer";
import { approveClient, rejectClient } from "./actions";

const ADMIN_EMAIL = "facu@floropolis.com";

type ClientProfile = {
  id: string;
  user_id: string;
  email: string | null;
  business_name: string | null;
  phone: string | null;
  status: "pending" | "approved" | "rejected";
  koronet_id: string | null;
  created_at: string;
  approved_at: string | null;
};

function StatusBadge({ status }: { status: ClientProfile["status"] }) {
  const styles = {
    pending: "bg-amber-100 text-amber-800 border-amber-200",
    approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
    rejected: "bg-red-100 text-red-700 border-red-200",
  };
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ApproveButton({ userId }: { userId: string }) {
  return (
    <form action={approveClient.bind(null, userId)}>
      <button
        type="submit"
        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 border border-emerald-300 hover:border-emerald-500 px-3 py-1.5 rounded-lg transition-colors"
      >
        Approve
      </button>
    </form>
  );
}

function RejectButton({ userId }: { userId: string }) {
  return (
    <form action={rejectClient.bind(null, userId)}>
      <button
        type="submit"
        className="text-xs font-semibold text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors"
      >
        Reject
      </button>
    </form>
  );
}

export const metadata = {
  title: "Client Queue | Floropolis Admin",
  robots: { index: false, follow: false },
};

export default async function AdminClientsPage() {
  const supabase = await createClient();

  // Server-side auth guard (middleware handles most cases, this is belt+suspenders)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    redirect("/shop");
  }

  // Fetch all client profiles, newest first
  const { data: clients, error } = await supabase
    .from("client_profiles")
    .select("id, user_id, business_name, phone, status, koronet_id, created_at, approved_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[admin/clients] fetch error:", error);
  }

  // Fetch emails via RPC (security definer function joins auth.users)
  const userIds = (clients ?? []).map((c: { user_id: string }) => c.user_id);
  const emailMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: emailRows } = await supabase.rpc("get_client_emails", { user_ids: userIds });
    (emailRows ?? []).forEach((r: { user_id: string; email: string }) => {
      emailMap[r.user_id] = r.email;
    });
  }

  const rows: ClientProfile[] = (clients ?? []).map((c: Omit<ClientProfile, "email">) => ({
    ...c,
    email: emailMap[c.user_id] ?? null,
  }));

  const counts = {
    total: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };

  return (
    <div className="min-h-screen bg-white">
      <TopBanner />
      <Navigation />

      <main className="max-w-7xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Client Signup Queue</h1>
          <p className="text-slate-500 text-sm mt-1">
            Review and approve new account requests. Only visible to facu@floropolis.com.
          </p>
          {/* Summary counts */}
          <div className="flex gap-4 mt-4">
            <div className="text-sm">
              <span className="font-semibold text-slate-900">{counts.total}</span>
              <span className="text-slate-500 ml-1">total</span>
            </div>
            <div className="text-sm">
              <span className="font-semibold text-amber-700">{counts.pending}</span>
              <span className="text-slate-500 ml-1">pending</span>
            </div>
            <div className="text-sm">
              <span className="font-semibold text-emerald-700">{counts.approved}</span>
              <span className="text-slate-500 ml-1">approved</span>
            </div>
            <div className="text-sm">
              <span className="font-semibold text-red-600">{counts.rejected}</span>
              <span className="text-slate-500 ml-1">rejected</span>
            </div>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <p className="text-5xl mb-4">📭</p>
            <p className="font-semibold text-slate-600">No signups yet</p>
            <p className="text-sm mt-1">New accounts will appear here.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold text-slate-700">Business</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-700">Email</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-700">Phone</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-700">Status</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-700">Registered</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-700">Koronet ID</th>
                  <th className="text-left px-5 py-3 font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((client) => (
                  <tr key={client.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-slate-900">
                        {client.business_name ?? <span className="text-slate-400 italic">Not provided</span>}
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5" title={client.user_id}>
                        {client.user_id.slice(0, 8)}…
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600 text-xs">
                      {client.email ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {client.phone ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={client.status} />
                    </td>
                    <td className="px-5 py-4 text-slate-500 text-xs whitespace-nowrap">
                      {new Date(client.created_at).toLocaleDateString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                      })}
                    </td>
                    <td className="px-5 py-4 text-slate-500 font-mono text-xs">
                      {client.koronet_id ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      {client.status !== "approved" && client.status !== "rejected" && (
                        <div className="flex gap-2">
                          <ApproveButton userId={client.user_id} />
                          <RejectButton userId={client.user_id} />
                        </div>
                      )}
                      {client.status === "approved" && (
                        <RejectButton userId={client.user_id} />
                      )}
                      {client.status === "rejected" && (
                        <ApproveButton userId={client.user_id} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-slate-400 mt-6">
          Note: Email column requires a Supabase service role key to join auth.users. User IDs are shown as partial IDs for now.
          To add email visibility: create a Postgres function with security definer that returns email by user_id, callable from anon key with RLS.
        </p>
      </main>

      <Footer />
    </div>
  );
}
