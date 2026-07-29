import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'EXHALE — Breath Acidity Monitor',
  description:
    'Real-time breath acidity monitoring and health tracking powered by the EXHALE IoT device.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
