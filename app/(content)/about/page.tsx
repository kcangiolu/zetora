import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { GithubLogoIcon } from '@phosphor-icons/react/dist/ssr';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { ZetoraLogo } from '@/components/logos/zetora-logo';
import { ZetoraWordmark } from '@/components/logos/zetora-wordmark';

const GITHUB_URL = 'https://github.com/kcangiolu/zetora';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Zetora is an open-source research assistant you run yourself: cited answers from live sources, with the models you choose.',
  alternates: {
    canonical: '/about',
  },
};

const principles = [
  {
    title: 'Your choice',
    description:
      'Use any of the supported cloud providers, an OpenAI-compatible server on your own hardware, or both. Pick the model per message; nothing ties you to one vendor.',
  },
  {
    title: 'Your control',
    description:
      'Conversations, files and memory live in the database and storage of the instance that runs Zetora. They only go to the providers that instance is configured to use.',
  },
  {
    title: 'Open code',
    description:
      'Zetora is licensed under the AGPL-3.0. You can read every line, check what it does with your data, change it and run your own copy.',
  },
];

const capabilities = [
  {
    title: 'Cited answers',
    description:
      'Zetora searches live sources and answers with inline citations, so every claim can be checked against where it came from.',
  },
  {
    title: 'Deep research',
    description:
      'For harder questions it plans the research, runs many searches, reads the pages and writes a structured report.',
  },
  {
    title: 'Sources',
    description:
      'The web, academic papers, Reddit, GitHub, YouTube, X, markets and more. Each one can be switched off for a conversation.',
  },
  {
    title: 'Your files',
    description: 'Upload PDFs, documents and images, and ask questions about them alongside web results.',
  },
  {
    title: 'Memory',
    description:
      'An editable profile and the facts Zetora learns from your conversations. You can read, edit or delete every entry in Settings.',
  },
  {
    title: 'Lookouts',
    description: 'Scheduled research on a topic, run on its own and sent to you by email.',
  },
  {
    title: 'Apps',
    description: 'Connect your own MCP servers and let Zetora use their tools in a conversation.',
  },
  {
    title: 'Voice',
    description: 'Talk to Zetora out loud, with a fully local speech pipeline as an option.',
  },
  {
    title: 'Personal data masking',
    description:
      'An optional layer that replaces names, emails and other personal data before a message reaches a cloud model.',
  },
];

const components = [
  { name: 'Models', cloud: 'OpenAI, Anthropic, Google, Mistral, OpenRouter…', local: 'Ollama, llama.cpp, vLLM' },
  { name: 'Web search', cloud: 'Exa, Tavily, Firecrawl', local: 'SearXNG, fastCRW' },
  { name: 'File storage', cloud: 'Cloudflare R2, AWS S3', local: 'Silo (S3-compatible)' },
  { name: 'Code execution', cloud: 'Daytona', local: 'Docker sandbox' },
  { name: 'Voice', cloud: 'ElevenLabs, xAI', local: 'Parakeet and Qwen3 TTS' },
  { name: 'Scheduling', cloud: 'Upstash QStash', local: 'BullMQ' },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between h-14 px-6">
            <Link href="/" className="flex items-center">
              <ZetoraWordmark height={22} />
            </Link>
            <div className="flex items-center gap-4">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <GithubLogoIcon className="w-4 h-4" />
                <span className="hidden sm:inline">GitHub</span>
              </a>
              <ThemeSwitcher />
              <Link href="/" className="text-sm font-medium text-foreground hover:text-foreground/70 transition-colors">
                Open Zetora
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6">
        {/* Introduction */}
        <section className="py-20">
          <span className="font-pixel text-[10px] uppercase tracking-[0.2em] text-primary/80 mb-4 block">
            Open source · AGPL-3.0
          </span>
          <h1 className="text-3xl sm:text-5xl font-light tracking-tight text-foreground font-be-vietnam-pro mb-6">
            A research assistant you run yourself.
          </h1>
          <div className="max-w-2xl space-y-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
            <p>
              Zetora answers questions by searching live sources and citing them, like the cloud answer engines do. The
              difference is where it runs and who decides: Zetora runs on a server you choose, with the models you
              choose, and keeps its data there.
            </p>
            <p>
              Every service it relies on can be a cloud provider or software running next to it. You can use it entirely
              in the cloud, entirely on your own hardware, or anywhere in between.
            </p>
          </div>
        </section>

        {/* Principles */}
        <section className="py-16 border-t border-border/50">
          <h2 className="text-xl font-medium tracking-tight font-be-vietnam-pro mb-10">Why Zetora</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {principles.map((principle) => (
              <div key={principle.title}>
                <h3 className="text-sm font-semibold text-foreground mb-2">{principle.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{principle.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Capabilities */}
        <section className="py-16 border-t border-border/50">
          <h2 className="text-xl font-medium tracking-tight font-be-vietnam-pro mb-3">What it does</h2>
          <p className="text-sm text-muted-foreground mb-10 max-w-2xl">
            Some features are optional: whoever runs an instance decides which ones it offers.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8">
            {capabilities.map((capability) => (
              <div key={capability.title}>
                <h3 className="text-sm font-semibold text-foreground mb-2">{capability.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{capability.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Cloud or local */}
        <section className="py-16 border-t border-border/50">
          <h2 className="text-xl font-medium tracking-tight font-be-vietnam-pro mb-3">
            Cloud or local, piece by piece
          </h2>
          <p className="text-sm text-muted-foreground mb-8 max-w-2xl">
            Each building block has a cloud option and a self-hosted one, bundled in the Docker Compose stack.
          </p>
          <div className="overflow-x-auto rounded-xl border border-border/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left">
                  <th className="px-4 py-3 font-medium text-foreground"></th>
                  <th className="px-4 py-3 font-medium text-foreground">Cloud</th>
                  <th className="px-4 py-3 font-medium text-foreground">Self-hosted</th>
                </tr>
              </thead>
              <tbody>
                {components.map((component) => (
                  <tr key={component.name} className="border-b border-border/30 last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{component.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{component.cloud}</td>
                    <td className="px-4 py-3 text-muted-foreground">{component.local}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Run your own */}
        <section className="py-16 border-t border-border/50">
          <h2 className="text-xl font-medium tracking-tight font-be-vietnam-pro mb-3">Run your own</h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
            Zetora is a Next.js app with a Docker Compose stack. The README covers the configuration, from an all-cloud
            setup to a fully self-hosted one.
          </p>
          <pre className="mb-6 overflow-x-auto rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-xs text-foreground">
            <code>git clone {GITHUB_URL}.git</code>
          </pre>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline underline-offset-4"
          >
            Read the setup guide on GitHub <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </section>

        {/* Credits */}
        <section className="py-16 border-t border-border/50">
          <h2 className="text-xl font-medium tracking-tight font-be-vietnam-pro mb-3">Credits</h2>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Zetora started as a fork of{' '}
            <a
              href="https://github.com/zaidmukaddam/scira"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:underline underline-offset-2"
            >
              Scira
            </a>{' '}
            by Zaid Mukaddam, also released under the AGPL-3.0. Bugs and ideas are welcome as{' '}
            <a
              href={`${GITHUB_URL}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:underline underline-offset-2"
            >
              GitHub issues
            </a>
            .
          </p>
        </section>
      </main>

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
              <Link
                href="/privacy-policy"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Privacy
              </Link>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
