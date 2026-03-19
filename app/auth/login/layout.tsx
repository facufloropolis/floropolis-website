import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Floropolis",
  description: "Sign in to your Floropolis wholesale account.",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
