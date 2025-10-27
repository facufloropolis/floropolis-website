import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login to Your Trade Account | Floropolis',
  description: 'Log in to access wholesale pricing, place orders, and manage your Floropolis trade account.',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

