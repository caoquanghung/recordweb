'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { usePermissions } from '@/components/auth/PermissionProvider';
import type { AppPermission } from '@/lib/auth/roles';
import { useAppTheme } from './useAppTheme';
import { useRecordingRecovery } from '@/components/recordings/RecordingRecoveryProvider';
import { PENDING_RECORDINGS_HREF } from '@/lib/pendingRecordings';
import styles from './AppSidebar.module.css';

export type AppSidebarBehavior = 'fixed' | 'adaptive';
export type AppSidebarIcon = 'dashboard' | 'studio' | 'library';

export interface AppSidebarItem {
  id: string;
  label: string;
  icon: AppSidebarIcon;
  href?: string;
  onSelect?: () => void;
  requiredPermission?: AppPermission;
}

interface AppSidebarProps {
  behavior?: AppSidebarBehavior;
  activeHref?: string;
  items?: AppSidebarItem[];
  userSubtitle?: string;
  className?: string;
}

const defaultItems: AppSidebarItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', href: '/dashboard' },
  { id: 'studio', label: 'Studio Giảng Bài', icon: 'studio', href: '/studio' },
  { id: 'library', label: 'Thư viện bài giảng', icon: 'library', href: '/library' },
  { id: 'admin-library', label: 'Quản trị thư viện', icon: 'library', href: '/admin/library', requiredPermission: 'recordings:manage' },
];

function isActiveRoute(pathname: string, href?: string) {
  if (!href) return false;
  if (href === '/') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getAvatarLabel(name: string) {
  return name.trim().split(/\s+/)[0]?.slice(0, 2) || 'GV';
}

export function AppSidebar({
  behavior = 'adaptive',
  activeHref,
  items = defaultItems,
  userSubtitle = 'KHOA CÔNG NGHỆ',
  className,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const { user } = useUser();
  const { theme, toggleTheme } = useAppTheme();
  const { hasPermission } = usePermissions();
  const { drafts } = useRecordingRecovery();
  const [isOpen, setIsOpen] = useState(false);
  const resolvedPathname = activeHref ?? pathname;
  const displayName = user?.fullName || user?.firstName || 'Thầy Hoàng Nam';
  const navigationItems = drafts.length > 0 && !items.some((item) => item.href === PENDING_RECORDINGS_HREF)
    ? [...items, { id: 'pending-recordings', label: 'Bài giảng chưa lưu', icon: 'library' as const, href: PENDING_RECORDINGS_HREF }]
    : items;

  function handleSelect(item: AppSidebarItem) {
    item.onSelect?.();
    setIsOpen(false);
  }

  return (
    <>
      {behavior === 'adaptive' && (
        <button
          type="button"
          className={styles.menuButton}
          aria-label={isOpen ? 'Đóng thanh điều hướng' : 'Mở thanh điều hướng'}
          aria-expanded={isOpen}
          aria-controls="app-sidebar"
          onClick={() => setIsOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>
      )}

      {behavior === 'adaptive' && (
        <button
          type="button"
          className={`${styles.backdrop} ${isOpen ? styles.backdropVisible : ''}`}
          aria-label="Đóng thanh điều hướng"
          tabIndex={isOpen ? 0 : -1}
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        id="app-sidebar"
        className={`${styles.sidebar} ${styles[behavior]} ${isOpen ? styles.open : ''} ${className ?? ''}`}
        aria-label="Điều hướng chính"
      >
        <div className={styles.topSection}>
          <Link className={styles.brand} href="/dashboard" onClick={() => setIsOpen(false)}>
            <span className={styles.brandMark} aria-hidden="true">
              <Image src="/figma/sidebar/brand.svg" alt="" width={26} height={21} />
            </span>
            <span className={styles.brandCopy}>
              <strong>Research Studio</strong>
              <span>Phòng Thu Trực Tuyến</span>
            </span>
          </Link>

          <nav className={styles.nav} aria-label="Các khu vực ứng dụng">
            {navigationItems.filter((item) => (
              !item.requiredPermission || hasPermission(item.requiredPermission)
            )).map((item) => {
              const active = isActiveRoute(resolvedPathname, item.href);
              const content = (
                <>
                  <span className={`${styles.navIcon} ${styles[`icon${item.icon}`]}`} aria-hidden="true" />
                  <span className={styles.navLabel}>{item.label}</span>
                  {active && <span className={styles.activeDot} aria-hidden="true" />}
                </>
              );
              const pending = item.href === PENDING_RECORDINGS_HREF;
              const itemClassName = `${styles.navItem} ${active ? styles.navItemActive : ''}`;

              return item.href ? (
                <Link
                  key={item.id}
                  href={item.href}
                  className={itemClassName}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => handleSelect(item)}
                >
                  {content}
                  {pending && <span className={styles.pendingCount} aria-label={`${drafts.length} bản ghi chưa lưu`}>{drafts.length}</span>}
                </Link>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  className={itemClassName}
                  onClick={() => handleSelect(item)}
                  disabled={!item.onSelect}
                >
                  {content}
                </button>
              );
            })}
          </nav>
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={styles.themeToggle}
            onClick={toggleTheme}
            aria-label={`Chuyển sang giao diện ${theme === 'dark' ? 'sáng' : 'tối'}`}
          >
            <span className={styles.themeToggleIcon} aria-hidden="true" />
            <span>{theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}</span>
          </button>
          <div className={styles.profileCard}>
            <div className={styles.userIdentity}>
              <span className={styles.avatar} aria-hidden="true">{getAvatarLabel(displayName)}</span>
              <span className={styles.userCopy}>
                <strong>{displayName}</strong>
                <span>{userSubtitle}</span>
              </span>
            </div>
            <button
              type="button"
              className={styles.signOutButton}
              aria-label="Đăng xuất"
              title="Đăng xuất"
              onClick={() => void signOut({ redirectUrl: '/' })}
            >
              <span aria-hidden="true" />
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}
