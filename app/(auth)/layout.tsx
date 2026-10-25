'use client';

import Link from 'next/link';
import { ZetoraWordmark } from '@/components/logos/zetora-wordmark';
import { Brain, Search, Eye, Server } from 'lucide-react';

const features = [
  { icon: Search, label: 'Cited Answers', description: 'Every claim linked to its source' },
  { icon: Brain, label: 'Deep Research', description: 'Planned, multi-step searches' },
  { icon: Eye, label: 'Lookouts', description: 'Scheduled research by email' },
  { icon: Server, label: 'Your Models', description: 'Cloud providers or your own hardware' },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh w-full bg-background">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] flex-col relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 pixel-grid-bg opacity-30" />
        <div className="absolute inset-0 bg-linear-to-br from-background via-background to-muted/30" />

        {/* Content */}
        <div className="relative flex-1 flex flex-col items-center justify-center px-12 xl:px-20">
          <div className="w-full max-w-md">
            {/* Logo */}
            <Link href="/" className="inline-flex items-center mb-12 group">
              <ZetoraWordmark
                height={40}
                className="text-primary transition-transform duration-300 group-hover:scale-110"
              />
            </Link>

            {/* Tagline */}
            <div className="mb-12">
              <p className="text-2xl xl:text-3xl font-light tracking-tight leading-snug text-foreground/90 font-be-vietnam-pro">
                Research anything,
                <br />
                on your own terms.
              </p>
              <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-sm">
                An open-source research assistant that answers from live sources with citations, using the models you
                choose.
              </p>
            </div>

            {/* Feature Pills */}
            <div className="grid grid-cols-2 gap-2.5 mb-12">
              {features.map((f) => (
                <div key={f.label} className="flex items-start gap-3 p-3 rounded-xl border border-border/30 bg-card/20">
                  <f.icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-foreground leading-tight">{f.label}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{f.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Auth Form */}
      <div className="flex-1 lg:w-[55%] xl:w-[50%] flex flex-col bg-background lg:border-l lg:border-border/50">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center h-16 border-b border-border/50 px-6">
          <Link href="/" className="flex items-center">
            <ZetoraWordmark height={26} className="text-primary" />
          </Link>
        </header>

        {/* Form Container */}
        <div className="flex-1 flex items-center justify-center px-6 py-12">{children}</div>

        {/* Footer */}
        <footer className="flex items-center justify-center gap-6 h-12 text-xs text-muted-foreground px-6">
          <Link href="/about" className="hover:text-foreground transition-colors">
            About
          </Link>
          <Link href="/privacy-policy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
        </footer>
      </div>
    </div>
  );
}
