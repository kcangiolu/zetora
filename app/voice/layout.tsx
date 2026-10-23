import { Metadata } from 'next';

const title = 'Zetora Voice';
const description =
  'Have a voice conversation with Zetora AI. Ask questions, search the web, and get real-time responses with our advanced voice AI assistant.';

export const metadata: Metadata = {
  title,
  description,
};

export default function VoiceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
