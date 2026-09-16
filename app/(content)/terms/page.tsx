import Link from 'next/link';
import { ArrowLeft, Clock, FileText, ArrowUpRight } from 'lucide-react';
import { ZetoraLogo } from '@/components/logos/zetora-logo';
import { ZetoraWordmark } from '@/components/logos/zetora-wordmark';

const sections = [
  { id: 'acceptance', label: 'Acceptance' },
  { id: 'service', label: 'Service' },
  { id: 'conduct', label: 'User Conduct' },
  { id: 'content', label: 'Content' },
  { id: 'ip', label: 'IP' },
  { id: 'third-party', label: 'Third-Party' },
  { id: 'pricing', label: 'Access' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'liability', label: 'Liability' },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between h-14 px-6">
            <Link href="/" className="flex items-center group">
              <ZetoraWordmark height={22} className="transition-transform duration-300 group-hover:scale-110" />
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/privacy-policy"
                className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacy Policy <ArrowUpRight className="w-3 h-3" />
              </Link>
              <Link
                href="/about"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-16">
          <main>
            {/* Title */}
            <div className="mb-12">
              <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-primary/80 mb-4 block">
                Legal
              </span>
              <h1 className="text-3xl sm:text-4xl font-light tracking-tight text-foreground font-be-vietnam-pro mb-4">
                Terms of Service
              </h1>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Last updated: March 16, 2026</span>
                <span className="w-px h-3 bg-border/50" />
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3" /> 8 min read
                </span>
              </div>
            </div>

            {/* TLDR */}
            <div className="mb-12 p-5 rounded-2xl border border-primary/15 bg-primary/3">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-primary/60" />
                <span className="font-pixel text-[10px] uppercase tracking-[0.15em] text-primary/80">
                  Quick Summary
                </span>
              </div>
              <p className="text-sm text-foreground/80 leading-relaxed">
                Zetora AI is free to use — sign in and get access to every model and feature, subject to a technical
                daily usage cap to prevent abuse. You own your queries. Be respectful, don&apos;t scrape, and verify
                important answers independently.
              </p>
            </div>

            {/* Content */}
            <div className="prose prose-neutral dark:prose-invert max-w-none prose-headings:font-be-vietnam-pro prose-headings:font-light prose-headings:tracking-tight prose-h2:text-lg prose-h2:mt-14 prose-h2:mb-4 prose-h2:scroll-mt-20 prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:text-[15px] prose-li:text-muted-foreground prose-li:text-[15px] prose-a:text-foreground prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground prose-strong:font-medium">
              <p className="text-base text-foreground/80 leading-relaxed">
                Welcome to Zetora AI. These Terms of Service govern your use of our website and services. By using
                Zetora AI, you agree to these terms in full. If you disagree with any part of these terms, please do not
                use our service.
              </p>

              <h2 id="acceptance">
                <span className="font-pixel text-xs text-muted-foreground/50 mr-2">01</span>Acceptance of Terms
              </h2>
              <p>
                By accessing or using Zetora AI, you acknowledge that you have read, understood, and agree to be bound
                by these Terms of Service. We reserve the right to modify these terms at any time, and such
                modifications shall be effective immediately upon posting. Your continued use of Zetora AI after any
                modifications indicates your acceptance of the modified terms.
              </p>

              <h2 id="service">
                <span className="font-pixel text-xs text-muted-foreground/50 mr-2">02</span>Description of Service
              </h2>
              <p>
                Zetora AI is an AI assistant that helps users research information on the internet and take action
                through connected third-party apps. Our service utilizes artificial intelligence to process search
                queries, provide relevant results, and interact with external services via the Model Context Protocol
                (MCP).
              </p>
              <p>
                Our service is hosted on Vercel and integrates with various AI technology providers, including OpenAI,
                Anthropic, xAI, and others, to deliver search results and content generation capabilities. Signed-in
                users may also connect third-party apps (such as GitHub, Notion, Slack, and others) via MCP to extend
                functionality.
              </p>

              <h2 id="conduct">
                <span className="font-pixel text-xs text-muted-foreground/50 mr-2">03</span>User Conduct
              </h2>
              <p>You agree not to use Zetora AI to:</p>
              <ul>
                <li>Engage in any activity that violates applicable laws or regulations</li>
                <li>Infringe upon the rights of others, including intellectual property rights</li>
                <li>Distribute malware, viruses, or other harmful computer code</li>
                <li>Attempt to gain unauthorized access to our systems or networks</li>
                <li>Conduct automated queries or scrape our service</li>
                <li>Generate or distribute illegal, harmful, or offensive content</li>
                <li>Interfere with the proper functioning of the service</li>
              </ul>

              <h2 id="content">
                <span className="font-pixel text-xs text-muted-foreground/50 mr-2">04</span>Content and Results
              </h2>
              <p>While we strive to provide accurate and reliable information, Zetora AI:</p>
              <ul>
                <li>Does not guarantee the accuracy, completeness, or reliability of any results</li>
                <li>Is not responsible for content generated based on your search queries</li>
                <li>May provide links to third-party websites over which we have no control</li>
              </ul>
              <p>
                You should exercise judgment and critical thinking when evaluating search results and generated content.
                Zetora AI should not be used as the sole source for making important decisions, especially in
                professional, medical, legal, or financial contexts.
              </p>

              <h2 id="ip">
                <span className="font-pixel text-xs text-muted-foreground/50 mr-2">05</span>Intellectual Property
              </h2>
              <p>
                All content, features, and functionality of Zetora AI, including but not limited to text, graphics,
                logos, icons, images, audio clips, and software, are the property of Zetora AI or its licensors and are
                protected by copyright, trademark, and other intellectual property laws.
              </p>
              <p>
                You may not copy, modify, distribute, sell, or lease any part of our service or included software
                without explicit permission.
              </p>

              <h2 id="third-party">
                <span className="font-pixel text-xs text-muted-foreground/50 mr-2">06</span>Third-Party Services
              </h2>
              <p>Zetora AI relies on third-party services to provide its functionality:</p>
              <ul>
                <li>Our service is hosted on Vercel&apos;s infrastructure</li>
                <li>We integrate with AI technology providers including OpenAI, Anthropic, xAI, and others</li>
                <li>
                  Signed-in users may connect third-party apps (GitHub, Notion, Slack, etc.) via MCP, which may
                  transmit data to those services
                </li>
                <li>These third-party services have their own terms of service and privacy policies</li>
                <li>We are not responsible for the practices or policies of these third-party services</li>
              </ul>

              <h2 id="pricing">
                <span className="font-pixel text-xs text-muted-foreground/50 mr-2">07</span>Access
              </h2>
              <p>
                Zetora AI does not sell subscriptions. Any account you create has access to every AI model and
                feature. We may, without prior notice, change the availability of specific AI models at any time if
                usage patterns, suspected misuse, abuse-prevention needs, provider cost changes, reliability
                concerns, security considerations, or other operational factors make such changes necessary.
              </p>
              <p>
                To prevent abuse, we apply a technical daily usage cap per account. This is not a paid tier and does
                not vary between accounts.
              </p>

              <h2 id="privacy">
                <span className="font-pixel text-xs text-muted-foreground/50 mr-2">08</span>Privacy
              </h2>
              <p>
                Your use of Zetora AI is also governed by our <Link href="/privacy-policy">Privacy Policy</Link>, which
                is incorporated into these Terms of Service by reference.
              </p>

              <h2 id="liability">
                <span className="font-pixel text-xs text-muted-foreground/50 mr-2">09</span>Limitation of Liability
              </h2>
              <p>
                To the maximum extent permitted by law, Zetora AI shall not be liable for any indirect, incidental,
                special, consequential, or punitive damages, including loss of profits, data, or goodwill, arising out
                of or in connection with your use of or inability to use the service.
              </p>

              <h2>
                <span className="font-pixel text-xs text-muted-foreground/50 mr-2">10</span>Disclaimers
              </h2>
              <p>
                Zetora AI is provided &quot;as is&quot; and &quot;as available&quot; without any warranties of any kind,
                either express or implied.
              </p>

              <h2>
                <span className="font-pixel text-xs text-muted-foreground/50 mr-2">11</span>Termination
              </h2>
              <p>
                We reserve the right to suspend or terminate your access to Zetora AI, with or without notice, for
                conduct that we believe violates these Terms of Service or is harmful to other users, us, or third
                parties.
              </p>

              <h2>
                <span className="font-pixel text-xs text-muted-foreground/50 mr-2">12</span>Governing Law
              </h2>
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which
                Zetora AI operates.
              </p>

              <h2>
                <span className="font-pixel text-xs text-muted-foreground/50 mr-2">13</span>Contact Us
              </h2>
              <p>If you have any questions about these Terms of Service, please contact us at:</p>
              <p>
                <a href="mailto:kenny@flowinit.fr">kenny@flowinit.fr</a>
              </p>
            </div>

            {/* Agreement Note */}
            <div className="mt-16 pt-8 border-t border-border/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                By using Zetora AI, you agree to these Terms and our{' '}
                <Link href="/privacy-policy" className="text-foreground hover:underline underline-offset-2">
                  Privacy Policy
                </Link>
                .
              </p>
              <Link
                href="/privacy-policy"
                className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-foreground/70 transition-colors group shrink-0"
              >
                Read Privacy Policy{' '}
                <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </Link>
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

              <div className="mt-8 pt-6 border-t border-border/30">
                <p className="text-[11px] text-muted-foreground mb-2">Related</p>
                <Link
                  href="/privacy-policy"
                  className="flex items-center gap-1.5 text-xs text-foreground hover:text-foreground/70 transition-colors"
                >
                  Privacy Policy <ArrowUpRight className="w-2.5 h-2.5" />
                </Link>
              </div>
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
              <span className="text-xs text-muted-foreground">&copy; {new Date().getFullYear()} Zetora</span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                Home
              </Link>
              <Link href="/about" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                About
              </Link>
              <Link href="/terms" className="text-xs text-foreground font-medium">
                Terms
              </Link>
              <Link
                href="/privacy-policy"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacy
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
