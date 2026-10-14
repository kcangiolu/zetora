import './globals.css';
import 'katex/dist/katex.min.css';
import 'leaflet/dist/leaflet.css';

import { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Be_Vietnam_Pro, Baumans, Geist, Instrument_Serif } from 'next/font/google';
import { GeistPixelSquare, GeistPixelGrid } from 'geist/font/pixel';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { Toaster } from '@/components/ui/sileo-toaster';
import { SidebarProvider } from '@/components/ui/sidebar';
import { NewChatHotkey } from '@/components/new-chat-hotkey';
import { HapticsProvider } from '@/components/haptics-provider';

import { Providers } from './providers';
import { CSP_HEADER, getNonceFromCsp } from '@/lib/csp';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000'),
  title: {
    default: 'Zetora AI',
    template: '%s | Zetora AI',
  },
  description:
    'Zetora is an open-source research assistant you run yourself: cited answers from live sources, with the models you choose.',
  openGraph: {
    url: '/',
    siteName: 'Zetora AI',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  alternates: {
    canonical: '/',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F9F9F9' },
    { media: '(prefers-color-scheme: dark)', color: '#111111' },
  ],
};

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ['latin'],
  variable: '--font-be-vietnam-pro',
  preload: true,
  display: 'swap',
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
});

const baumans = Baumans({
  subsets: ['latin'],
  variable: '--font-baumans',
  preload: true,
  display: 'swap',
  weight: ['400'],
});

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-sans',
  preload: true,
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  variable: '--font-instrument-serif',
  preload: true,
  display: 'swap',
  weight: ['400'],
  style: ['normal', 'italic'],
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = getNonceFromCsp((await headers()).get(CSP_HEADER));

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geist.variable} ${beVietnamPro.variable} ${baumans.variable} ${instrumentSerif.variable} ${GeistPixelSquare.variable} ${GeistPixelGrid.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <NuqsAdapter>
          <Providers nonce={nonce}>
            <SidebarProvider>
              <Toaster position="top-center" />
              <HapticsProvider />
              <NewChatHotkey />
              {children}
            </SidebarProvider>
          </Providers>
        </NuqsAdapter>
      </body>
    </html>
  );
}
