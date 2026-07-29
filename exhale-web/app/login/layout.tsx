import type { Metadata } from 'next';
import '../../styles/globals.css';

export const metadata: Metadata = {
  title: 'Sign In — EXHALE',
  description: 'Sign in to your EXHALE acidity monitoring account.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
