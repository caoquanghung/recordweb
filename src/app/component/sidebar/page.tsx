import type { Metadata } from 'next';
import { SidebarShowcase } from '@/components/app/SidebarShowcase';

export const metadata: Metadata = {
  title: 'Sidebar component | RecordWeb',
  description: 'Showcase cho sidebar fixed và adaptive của RecordWeb.',
};

export default function SidebarComponentPage() {
  return <SidebarShowcase />;
}
