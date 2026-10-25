import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SidebarShowcase } from '@/components/app/SidebarShowcase';
import { getAuthContext } from '@/lib/auth';
import { hasPermission } from '@/lib/auth/roles';

export const metadata: Metadata = {
  title: 'Sidebar component | RecordWeb',
  description: 'Showcase cho sidebar fixed và adaptive của RecordWeb.',
};

// This internal page must read the Clerk session before rendering.
export const instant = false;

export default async function SidebarComponentPage() {
  const context = await getAuthContext();
  if (!context || !hasPermission(context.role, 'experiments:use')) {
    notFound();
  }

  return <SidebarShowcase />;
}
