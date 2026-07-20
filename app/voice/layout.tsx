import { Metadata } from 'next';

const title = 'Zetora Voice';
const description =
  'Have a voice conversation with Zetora AI. Ask questions, search the web, and get real-time responses with our advanced voice AI assistant.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    url: '/voice',
    siteName: 'Zetora AI',
    type: 'website',
    images: [
      {
        url: '/voice/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'Zetora Voice - AI Voice Assistant',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/voice/twitter-image.png'],
    creator: '@zetoraai',
  },
  alternates: {
    canonical: '/voice',
  },
};

export default function VoiceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
