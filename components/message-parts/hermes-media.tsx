'use client';

import { Download, FileText } from 'lucide-react';
import type { HermesMediaData } from '@/lib/types';

// Renders a Hermes `send_media` action (docs/relay-connector-contract.md §4). `url` is
// always Zetora's own storage (see app/api/internal/hermes/media/route.ts) — never a
// bare pass-through of whatever the gateway cited as source_url.
export function HermesMediaCard({ media }: { media: HermesMediaData }) {
  const { mediaKind, url, filename, caption } = media;

  return (
    <div className="space-y-1.5">
      {mediaKind === 'image' && (
        // eslint-disable-next-line @next/next/no-img-element -- external/self-hosted media, not a Next-optimizable local asset
        <img src={url} alt={caption ?? filename ?? 'Image from Hermes'} className="max-w-full rounded-lg" />
      )}
      {(mediaKind === 'voice' || mediaKind === 'audio') && (
        <audio controls src={url} className="w-full max-w-sm">
          <a href={url}>{filename ?? 'audio'}</a>
        </audio>
      )}
      {mediaKind === 'video' && <video controls src={url} className="max-w-full rounded-lg" />}
      {mediaKind === 'document' && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-[13px] hover:bg-muted/40 transition-colors"
        >
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{filename ?? 'Document'}</span>
          <Download className="size-3.5 shrink-0 text-muted-foreground/70" />
        </a>
      )}
      {caption && mediaKind !== 'image' && <p className="text-[13px] text-muted-foreground">{caption}</p>}
    </div>
  );
}
