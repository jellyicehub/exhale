import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Account — EXHALE',
  description: 'Create your EXHALE account to start tracking your breath acidity.',
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
