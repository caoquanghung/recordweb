'use client';

import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import styles from './AppNavigation.module.css';

export type AppSection = 'studio' | 'presentation' | 'dashboard' | 'library' | 'settings';

function NavIcon({ name }: { name: AppSection }) {
  const paths: Record<AppSection, React.ReactNode> = {
    studio: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></>,
    presentation: <><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3M7 9h10M7 13h6"/></>,
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    library: <><path d="M4 5.5h16v14H4z"/><path d="M8 5.5V3h8v2.5M8 10h8M8 14h6"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

const links: Array<{ section: AppSection; href: string; label: string }> = [
  { section: 'studio', href: '/studio', label: 'Studio' },
  { section: 'presentation', href: '/presentation', label: 'Presentation' },
  { section: 'dashboard', href: '/dashboard', label: 'Dashboard' },
  { section: 'library', href: '/library', label: 'Library' },
];

export function AppNavigation({ active }: { active: AppSection }) {
  return (
    <aside className={styles.navigation} aria-label="Primary navigation">
      <Link className={styles.brandMark} href="/dashboard" aria-label="RecordWeb dashboard">R</Link>
      <nav className={styles.navStack}>
        {links.map((link) => (
          <Link
            key={link.section}
            className={`${styles.navButton} ${active === link.section ? styles.navButtonActive : ''}`}
            href={link.href}
            aria-current={active === link.section ? 'page' : undefined}
            aria-label={link.label}
            title={link.label}
          >
            <NavIcon name={link.section} />
          </Link>
        ))}
      </nav>
      <div className={styles.navBottom}>
        <Link
          className={`${styles.navButton} ${active === 'settings' ? styles.navButtonActive : ''}`}
          href="/settings"
          aria-current={active === 'settings' ? 'page' : undefined}
          aria-label="Settings"
          title="Settings"
        >
          <NavIcon name="settings" />
        </Link>
        <UserButton />
      </div>
    </aside>
  );
}
