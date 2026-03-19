"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="text-sm font-semibold text-slate-600 hover:text-red-600 border border-slate-300 hover:border-red-300 px-4 py-2 rounded-lg transition-colors"
    >
      Sign out
    </button>
  );
}
