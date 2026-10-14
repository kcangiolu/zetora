import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { ArrowLeft } from 'lucide-react';
import { serverEnv } from '@/env/server';
import { ZetoraLogo } from '@/components/logos/zetora-logo';
import { ZetoraWordmark } from '@/components/logos/zetora-wordmark';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What this Zetora instance stores, what it sends to other services, and how to exercise your rights.',
  alternates: {
    canonical: '/privacy-policy',
  },
};

const sections = [
  { id: 'who', label: 'Who is responsible' },
  { id: 'stored', label: 'What is stored' },
  { id: 'shared', label: 'What is sent elsewhere' },
  { id: 'not-done', label: 'What is never done' },
  { id: 'browser', label: 'Cookies and browser storage' },
  { id: 'retention', label: 'Retention and deletion' },
  { id: 'rights', label: 'Your rights' },
  { id: 'changes', label: 'Changes' },
];

function SectionHeading({ id, index, children }: { id: string; index: number; children: React.ReactNode }) {
  return (
    <h2 id={id}>
      <span className="font-pixel text-xs text-muted-foreground/50 mr-2">{String(index).padStart(2, '0')}</span>
      {children}
    </h2>
  );
}

export default async function PrivacyPage() {
  // The contact address comes from this instance's runtime environment, not the build.
  await connection();
  const contactEmail = serverEnv.CONTACT_EMAIL;

  const contact = contactEmail ? (
    <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
  ) : (
    <strong>no contact address has been configured for this instance (CONTACT_EMAIL)</strong>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between h-14 px-6">
            <Link href="/" className="flex items-center">
              <ZetoraWordmark height={22} />
            </Link>
            <Link
              href="/about"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              About
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-16">
          <main>
            {/* Title */}
            <div className="mb-12">
              <h1 className="text-3xl sm:text-4xl font-light tracking-tight text-foreground font-be-vietnam-pro mb-4">
                Privacy Policy
              </h1>
              <p className="text-sm text-muted-foreground">Last updated: October 14, 2026</p>
            </div>

            <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-be-vietnam-pro prose-headings:font-light prose-headings:tracking-tight prose-h2:text-lg prose-h2:mt-14 prose-h2:mb-4 prose-h2:scroll-mt-20 prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:text-[15px] prose-li:text-muted-foreground prose-li:text-[15px] prose-a:text-foreground prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground prose-strong:font-medium">
              <p className="text-base text-foreground/80 leading-relaxed">
                Zetora is open-source software that anyone can run on their own server. This page describes what the
                software does with your data on this instance. It is the same for every instance running an unmodified
                copy of Zetora; which outside services are involved depends on how this instance is configured.
              </p>

              <SectionHeading id="who" index={1}>
                Who is responsible
              </SectionHeading>
              <p>
                This instance is run by its administrator, who controls its server, its configuration and the data it
                holds. The authors of Zetora have no access to it. For any question or request about your data, write to
                the administrator: {contact}.
              </p>

              <SectionHeading id="stored" index={2}>
                What is stored
              </SectionHeading>
              <p>This instance keeps the following in its own database and file storage:</p>
              <ul>
                <li>
                  <strong>Your account:</strong> name, email address, profile picture if your sign-in provider supplies
                  one, a hash of your password if you sign in with one, and two-factor settings if you enable them.
                </li>
                <li>
                  <strong>Sign-in sessions:</strong> the IP address and browser of each active session, so you stay
                  signed in.
                </li>
                <li>
                  <strong>Conversations:</strong> your messages, the answers, their sources, the files you attach and
                  the images or documents generated for you.
                </li>
                <li>
                  <strong>Memory:</strong> the profile and facts Zetora keeps about you to personalize answers, if you
                  use it. You can read and edit all of it in Settings.
                </li>
                <li>
                  <strong>Settings:</strong> your preferences, custom instructions, Lookouts, connected apps and, if you
                  allow them, notification subscriptions. API keys and app credentials you enter are encrypted before
                  they are stored.
                </li>
                <li>
                  <strong>Usage count:</strong> the number of messages you send per day, used to cap abuse.
                </li>
              </ul>

              <SectionHeading id="shared" index={3}>
                What is sent elsewhere
              </SectionHeading>
              <p>
                To answer you, this instance sends data to the services it is configured to use. Some may run on the
                same server; others are cloud providers with their own privacy policies.
              </p>
              <ul>
                <li>
                  <strong>The AI model you use:</strong> your message, the earlier messages of the conversation, the
                  relevant parts of your memory and your attached files go to the provider of the selected model.
                </li>
                <li>
                  <strong>Search and web reading:</strong> search queries and the addresses of pages to read go to the
                  configured search and scraping services.
                </li>
                <li>
                  <strong>Sign-in:</strong> if you sign in with GitHub, Google, Microsoft or X, that provider learns
                  that you signed in here.
                </li>
                <li>
                  <strong>Email:</strong> your address and the message content go to the instance&apos;s mail server for
                  verification emails and Lookout results.
                </li>
                <li>
                  <strong>Voice:</strong> your audio goes to the configured speech-recognition and speech-synthesis
                  services.
                </li>
                <li>
                  <strong>Apps:</strong> an MCP server you connect receives what Zetora sends to its tools.
                </li>
              </ul>
              <p>
                If the administrator enables personal data masking, names, email addresses and similar details can be
                replaced before a message reaches a cloud model.
              </p>
              <p>A conversation is private by default. If you make it public, anyone with its link can read it.</p>

              <SectionHeading id="not-done" index={4}>
                What is never done
              </SectionHeading>
              <p>
                Zetora contains no advertising, no analytics and no tracking scripts. It does not sell your data and
                sends nothing to its authors.
              </p>

              <SectionHeading id="browser" index={5}>
                Cookies and browser storage
              </SectionHeading>
              <p>
                Zetora uses a cookie to keep you signed in, and your browser&apos;s local storage for interface
                preferences. It sets no third-party cookies.
              </p>
              <p>
                Answers can show images, videos and posts from the sites they cite. Your browser loads some of them
                directly from those sites, which then see your IP address like on any visit.
              </p>

              <SectionHeading id="retention" index={6}>
                Retention and deletion
              </SectionHeading>
              <p>
                Your data stays on this instance until it is deleted. You can delete your conversations and memory
                entries yourself. To delete your account and everything attached to it, contact the administrator:{' '}
                {contact}.
              </p>

              <SectionHeading id="rights" index={7}>
                Your rights
              </SectionHeading>
              <p>
                Depending on where you live, for example in the European Union under the GDPR, you can ask to access,
                correct, export or delete your personal data, and object to how it is used. Send these requests to the
                administrator: {contact}.
              </p>

              <SectionHeading id="changes" index={8}>
                Changes
              </SectionHeading>
              <p>
                This page changes when Zetora changes how it handles data. The date at the top shows the last update.
              </p>
            </div>
          </main>

          {/* Sidebar - Table of Contents */}
          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <p className="font-pixel text-[9px] uppercase tracking-[0.15em] text-muted-foreground mb-4">
                On this page
              </p>
              <nav className="space-y-1">
                {sections.map((s, i) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 group"
                  >
                    <span className="font-pixel text-[9px] text-muted-foreground/40 group-hover:text-primary/60 transition-colors w-4 text-right">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {s.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/50">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-8">
            <div className="flex items-center gap-3">
              <ZetoraLogo className="size-4" />
              <span className="text-xs text-muted-foreground">Zetora · AGPL-3.0</span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Home
              </Link>
              <Link href="/about" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                About
              </Link>
              <Link href="/privacy-policy" className="text-xs text-foreground font-medium">
                Privacy
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
