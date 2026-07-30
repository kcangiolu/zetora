/* eslint-disable @next/next/no-img-element */
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Pencil, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TextShimmer } from '@/components/core/text-shimmer';
import { ImageCompareSlider } from '@/components/image-compare-slider';

const REVEAL_TRANSITION = { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const };

function parseAspectRatio(size?: string): string {
  const match = size?.match(/^(\d+)\s*[x×]\s*(\d+)$/);
  if (!match) return '1 / 1';
  return `${match[1]} / ${match[2]}`;
}

export type GeneratedImageCardProps = {
  mode: 'generate' | 'edit';
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  prompt?: string;
  size?: string;
  sourceImageUrl?: string;
  imageUrl?: string;
  error?: string;
};

export function GeneratedImageCard({ mode, state, prompt, size, sourceImageUrl, imageUrl, error }: GeneratedImageCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const hasError = state === 'output-error' || (state === 'output-available' && !imageUrl);

  // History-replay guard: an already-finished image (old chat reload) renders statically, no animation.
  const [skipAnimation] = useState(() => state === 'output-available' && !!imageUrl);
  const [imageReady, setImageReady] = useState(skipAnimation);
  const [revealed, setRevealed] = useState(skipAnimation);
  const imgRef = useRef<HTMLImageElement>(null);

  const Icon = mode === 'generate' ? Wand2 : Pencil;
  const label = mode === 'generate' ? 'Generating image…' : 'Editing image…';
  const errorTitle = mode === 'generate' ? 'Image generation failed' : 'Image editing failed';
  const aspectRatio = parseAspectRatio(size);

  useEffect(() => {
    if (!skipAnimation && imageUrl && imgRef.current?.complete) {
      setImageReady(true);
    }
  }, [imageUrl, skipAnimation]);

  if (hasError) {
    return <ImageToolError icon={Icon} title={errorTitle} message={error} />;
  }

  const showPlaceholder = !skipAnimation && !revealed;

  return (
    <div className="w-full my-4 rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="relative w-full bg-muted" style={showPlaceholder ? { aspectRatio } : undefined}>
        {showPlaceholder && (
          <DiffusionPlaceholder
            icon={Icon}
            label={label}
            prompt={prompt}
            sourceImageUrl={mode === 'edit' ? sourceImageUrl : undefined}
            prefersReducedMotion={!!prefersReducedMotion}
            fadeOut={imageReady}
            onFadeOutComplete={() => setRevealed(true)}
          />
        )}
        {imageUrl && mode === 'edit' && sourceImageUrl && (revealed || skipAnimation) ? (
          <ImageCompareSlider beforeUrl={sourceImageUrl} afterUrl={imageUrl} beforeAlt="Image originale" afterAlt={prompt || 'Edited image'} />
        ) : (
          imageUrl && (
            <motion.img
              ref={imgRef}
              src={imageUrl}
              alt={prompt || (mode === 'generate' ? 'Generated image' : 'Edited image')}
              className={cn('block', revealed ? 'w-full h-auto' : 'absolute inset-0 w-full h-full object-cover')}
              initial={skipAnimation ? false : { opacity: 0, filter: 'blur(20px)', scale: 1.04 }}
              animate={skipAnimation || imageReady ? { opacity: 1, filter: 'blur(0px)', scale: 1 } : {}}
              transition={prefersReducedMotion ? { duration: 0.2 } : REVEAL_TRANSITION}
              onLoad={() => setImageReady(true)}
            />
          )
        )}
      </div>
      {prompt && (
        <div className="px-4 py-2.5 border-t border-border bg-muted">
          <p className="text-xs text-muted-foreground line-clamp-2">{prompt}</p>
        </div>
      )}
    </div>
  );
}

function DiffusionPlaceholder({
  icon: Icon,
  label,
  prompt,
  sourceImageUrl,
  prefersReducedMotion,
  fadeOut,
  onFadeOutComplete,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  prompt?: string;
  sourceImageUrl?: string;
  prefersReducedMotion: boolean;
  fadeOut: boolean;
  onFadeOutComplete: () => void;
}) {
  return (
    <motion.div
      className="absolute inset-0 overflow-hidden bg-muted"
      initial={false}
      animate={{ opacity: fadeOut ? 0 : 1 }}
      transition={{ duration: prefersReducedMotion ? 0.15 : 0.4 }}
      onAnimationComplete={() => {
        if (fadeOut) onFadeOutComplete();
      }}
    >
      {sourceImageUrl && (
        <img src={sourceImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover blur-md scale-110 opacity-50" />
      )}
      <div
        className={cn('absolute inset-[-10%]', !prefersReducedMotion && 'animate-diffusion-drift')}
        style={{
          filter: 'blur(24px)',
          willChange: prefersReducedMotion ? undefined : 'transform',
          background: `
            radial-gradient(circle at 30% 30%, color-mix(in oklab, var(--primary) 45%, transparent), transparent 60%),
            radial-gradient(circle at 70% 40%, color-mix(in oklab, var(--secondary) 45%, transparent), transparent 60%),
            radial-gradient(circle at 50% 75%, color-mix(in oklab, var(--accent) 45%, transparent), transparent 60%)
          `,
        }}
      />
      {!prefersReducedMotion && (
        <div
          className="absolute inset-0 animate-diffusion-sweep"
          style={{
            willChange: 'background-position',
            background:
              'linear-gradient(90deg, transparent 0%, color-mix(in oklab, var(--foreground) 8%, transparent) 50%, transparent 100%)',
          }}
        />
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-background/60 backdrop-blur-sm">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        <TextShimmer className="text-sm font-medium" duration={1.8}>
          {label}
        </TextShimmer>
        {prompt && <p className="max-w-xs text-xs text-muted-foreground line-clamp-2">{prompt}</p>}
      </div>
    </motion.div>
  );
}

function ImageToolError({
  icon: Icon,
  title,
  message,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  message?: string;
}) {
  return (
    <div className="w-full my-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900 flex items-center justify-center">
            <Icon className="h-4 w-4 text-red-600 dark:text-red-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-red-900 dark:text-red-100">{title}</h3>
            {message && <p className="text-xs text-red-700 dark:text-red-300 mt-1">{message}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
