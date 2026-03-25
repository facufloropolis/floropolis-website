"use server";
// Admin client actions — v1 | 2026-03-23 | Job_PM
// approve / reject client profiles. Only callable from admin pages.

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function approveClient(userId: string) {
  const supabase = await createClient();
  await supabase
    .from("client_profiles")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("user_id", userId);
  revalidatePath("/admin/clients");
}

export async function rejectClient(userId: string) {
  const supabase = await createClient();
  await supabase
    .from("client_profiles")
    .update({ status: "rejected" })
    .eq("user_id", userId);
  revalidatePath("/admin/clients");
}
