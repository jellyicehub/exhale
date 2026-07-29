'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth';

interface NavbarProps {
  userName?: string;
}

const NAV_LINKS = [
  { href: '/',         label: 'Dashboard' },
  { href: '/profile',  label: 'Profile'   },
  { href: '/settings', label: 'Settings'  },
];

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
  );
}
