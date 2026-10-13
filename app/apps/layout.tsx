import React from 'react';
import type { Metadata } from 'next';
import { SidebarLayout } from '@/components/sidebar-layout';

const title = 'Apps';
const description = 'Connect any app that exposes an MCP server and use its tools in chat.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    url: '/apps',
    siteName: 'Zetora AI',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    creator: '@zetoraai',
  },
  alternates: {
    canonical: '/apps',
  },
};

export default function AppsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarLayout>
      <div className="min-h-screen bg-background">{children}</div>
    </SidebarLayout>
  );
}
