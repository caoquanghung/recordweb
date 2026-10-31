'use client';

import { UserButton } from '@clerk/nextjs';
import Link from 'next/link';
import styles from './AppNavigation.module.css';

export type AppSection = 'studio' | 'presentation' | 'dashboard' | 'library';

function NavIcon({ name }: { name: AppSection }) {
  const paths: Record<AppSection, React.ReactNode> = {
    studio: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></>,
    presentation: <><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3M7 9h10M7 13h6"/></>,
    dashboard: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    library: <><path d="M4 5.5h16v14H4z"/><path d="M8 5.5V3h8v2.5M8 10h8M8 14h6"/></>,
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
        <UserButton />
      </div>
    </aside>
  );
}
