import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Register for Trade Account | Floropolis',
  description: 'Register your wholesale trade account to access live pricing, place orders, and get Net-30 payment terms.',
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

