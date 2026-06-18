'use client';

import { useCallback, useRef, useState } from 'react';

const PCM_SAMPLE_RATE = 24000;

interface UseSpeechOptions {
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

interface UseSpeechReturn {
  speak: (text: string) => Promise<void>;
  stop: () => void;
  isSpeaking: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useSpeech(options: UseSpeechOptions = {}): UseSpeechReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const abortRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsSpeaking(false);
    setIsLoading(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      stop();
      abortRef.current = false;

      try {
        setIsLoading(true);
        setIsSpeaking(true);
        setError(null);
        options.onStart?.();

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        const response = await fetch('/api/tts/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`TTS stream failed: ${response.status}`);
        }

        const audioContext = new AudioContext({ sampleRate: PCM_SAMPLE_RATE });
        audioContextRef.current = audioContext;
        setIsLoading(false);

        const reader = response.body.getReader();
        const chunkSize = PCM_SAMPLE_RATE * 4;
        let pending = new Uint8Array(0);

        while (!abortRef.current) {
          const { done, value } = await reader.read();
          if (done) break;

          const combined = new Uint8Array(pending.length + value.length);
          combined.set(pending);
          combined.set(value, pending.length);
          pending = combined;

          while (pending.length >= chunkSize && !abortRef.current) {
            const chunk = pending.slice(0, chunkSize);
            pending = pending.slice(chunkSize);
            await playPCM(audioContext, chunk);
          }
        }

        if (pending.length > 0 && !abortRef.current) {
          await playPCM(audioContext, pending);
        }

        await audioContext.close();
        audioContextRef.current = null;
        setIsSpeaking(false);
        options.onEnd?.();
      } catch (err) {
        if (abortRef.current) return;
        const e = err instanceof Error ? err : new Error('Speech synthesis failed');
        setError(e.message);
        setIsSpeaking(false);
        setIsLoading(false);
        options.onError?.(e);
      }
    },
    [stop, options]
  );

  return { speak, stop, isSpeaking, isLoading, error };
}

function playPCM(ctx: AudioContext, s16le: Uint8Array): Promise<void> {
  const samples = Math.floor(s16le.length / 2);
  const f32 = new Float32Array(samples);
  const view = new DataView(s16le.buffer, s16le.byteOffset, s16le.length);
  for (let i = 0; i < samples; i++) f32[i] = view.getInt16(i * 2, true) / 32768;

  const buf = ctx.createBuffer(1, f32.length, ctx.sampleRate);
  buf.getChannelData(0).set(f32);

  return new Promise((resolve) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.onended = () => resolve();
    src.start(0);
  });
}
