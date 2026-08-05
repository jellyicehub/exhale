'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth';
import ThemeToggle from '@/components/ThemeToggle';

interface NavbarProps {
  userName?: string;
}

const NAV_LINKS = [
  { href: '/',         label: 'Dashboard' },
  { href: '/profile',  label: 'Profile'   },
  { href: '/settings', label: 'Settings'  },
];

// SVG icons for the mobile tab bar
const TAB_ICONS: Record<string, React.ReactNode> = {
  '/': (
    // Dashboard — grid icon
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  '/profile': (
    // Profile — user circle icon
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  ),
  '/settings': (
    // Settings — gear icon
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

export default function Navbar({ userName }: NavbarProps) {
  const pathname = usePathname();
  const router   = useRouter();

  async function handleSignOut() {
    await signOut();
    // Supabase clears its own session cookies via auth.signOut()
    router.push('/login');
    router.refresh();
  }

  const initials = userName
    ? userName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <>
      <nav className="navbar">
        <div className="navbar-brand">
          <div className="navbar-brand-dot" />
          EXHALE
        </div>

        <div className="navbar-nav">
          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`navbar-link ${pathname === link.href ? 'active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="navbar-user">
          <ThemeToggle />
          <div className="navbar-avatar" title={userName}>
            {initials}
          </div>
          <button
            id="navbar-signout"
            className="navbar-signout"
            onClick={handleSignOut}
            type="button"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Mobile bottom tab bar — only visible on ≤ 640px via CSS */}
      <div className="mobile-tab-bar" role="tablist" aria-label="Main navigation">
        {NAV_LINKS.map(link => (
          <Link
            key={link.href}
            href={link.href}
            role="tab"
            aria-selected={pathname === link.href}
            className={`mobile-tab-item ${pathname === link.href ? 'active' : ''}`}
          >
            <span className="mobile-tab-icon" aria-hidden="true">
              {TAB_ICONS[link.href]}
            </span>
            <span className="mobile-tab-label">{link.label}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

