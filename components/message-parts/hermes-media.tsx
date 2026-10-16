'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, Loader2, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AudioPlayerDuration,
  AudioPlayerProgress,
  AudioPlayerProvider,
  AudioPlayerTime,
  useAudioPlayer,
} from '@/components/ui/audio-player';
import type { HermesMediaData } from '@/lib/types';

// Native <audio controls> works, but its controls render on the browser's OWN
// compositing layer (an OS-level widget, not a styled DOM node) — in a mobile webview
// that layer has to be repositioned separately from the page on every scroll frame,
// which is what produced the reported scroll stutter. This custom player is plain DOM
// (buttons + a slider), so it scrolls exactly like the rest of the message.
function HermesVoicePlayer({ url }: { url: string }) {
  return (
    <AudioPlayerProvider>
      <HermesVoicePlayerInner url={url} />
    </AudioPlayerProvider>
  );
}

function HermesVoicePlayerInner({ url }: { url: string }) {
  const player = useAudioPlayer();
  const item = useMemo(() => ({ id: url, src: url }), [url]);

  // Loads metadata (so duration shows immediately) without playing — mirrors what a
  // native <audio> element does by default on mount, so this isn't a new network cost.
  useEffect(() => {
    void player.setActiveItem(item);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run if the url itself changes
  }, [item.id]);

  const isActive = player.isItemActive(item.id);
  const isPlaying = isActive && player.isPlaying;
  const isBuffering = isActive && player.isBuffering && player.isPlaying;

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 w-full max-w-sm">
      <Button
        type="button"
        size="icon"
        className="size-8 shrink-0 rounded-full"
        onClick={() => {
          if (isPlaying) player.pause();
          else void player.play(item);
        }}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isBuffering ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="size-3.5" />
        ) : (
          <Play className="size-3.5" />
        )}
      </Button>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <AudioPlayerProgress />
        <div className="flex items-center justify-between">
          <AudioPlayerTime className="text-[11px]" />
          <AudioPlayerDuration className="text-[11px]" />
        </div>
      </div>
    </div>
  );
}

// Same reasoning as HermesVoicePlayer above: native <video controls> renders its
// scrubber/play button as an OS-level widget, not a styled DOM node — dropping `controls`
// and driving play/pause through the ref instead avoids that compositing layer entirely.
// No scrubber here (audio's AudioPlayerProgress isn't reused) — kept intentionally minimal;
// tap-to-pause is enough for a chat-bubble clip.
function HermesVideoPlayer({ url }: { url: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  return (
    <div className="group relative max-w-full overflow-hidden rounded-lg">
      <video
        ref={videoRef}
        src={url}
        playsInline
        className="block max-w-full rounded-lg"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={togglePlay}
      />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        className={
          isPlaying
            ? 'absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100'
            : 'absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity'
        }
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg">
          {isPlaying ? <Pause className="size-5" /> : <Play className="size-5 ml-0.5" />}
        </span>
      </button>
    </div>
  );
}

// Renders a Hermes `send_media` action (docs/relay-connector-contract.md §4). `url` is
// always Zetora's own storage (see app/api/internal/hermes/media/route.ts) — never a
// bare pass-through of whatever the gateway cited as source_url.
export function HermesMediaCard({ media }: { media: HermesMediaData }) {
  const { mediaKind, url, filename, caption } = media;

  return (
    <div className="space-y-1.5">
      {mediaKind === 'image' && (
        <img src={url} alt={caption ?? filename ?? 'Image from Hermes'} className="max-w-full rounded-lg" />
      )}
      {(mediaKind === 'voice' || mediaKind === 'audio') && <HermesVoicePlayer url={url} />}
      {mediaKind === 'video' && <HermesVideoPlayer url={url} />}
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
