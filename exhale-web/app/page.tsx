import { redirect } from 'next/navigation';

// The real dashboard lives in the (app) route group.
// This page should never render — the middleware handles auth redirects.
export default function RootPage() {
  redirect('/');
}
