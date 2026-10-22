'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { Z_PATH, Z_WIDTH } from '@/components/logos/zetora-logo';
import { ModeAccentSpread, useModeAccentStyle } from '@/components/mode-accent';
import { cn } from '@/lib/utils';

export type VoiceMarkMode = 'zetora' | 'hermes';
type AgentState = null | 'thinking' | 'listening' | 'talking';

// Geometry of the "ripple" mark in a 0-100 box: four orbits 45° apart around the Z.
const ORBITS = 4;
const ORBIT_RX = 42;
const ORBIT_RY = 16;
const STROKE_WIDTH = 3.2;
const Z_SCALE = 0.27;

// Each orbit pinches in turn, a quarter period after the previous one.
const RIPPLE_PERIOD_S = 3.8;
const RIPPLE_DEPTH = 0.24;
const BREATH_DEPTH = 0.16;
// Agent mode's rotating sweep (app/globals.css's .mode-accent-border).
const SWEEP_PERIOD_S = 4;
const MODE_FADE_S = 0.7;

// Speech RMS sits around 0.02-0.2: this gain brings a normal voice near 1.
const VOLUME_GAIN = 5;
const VOLUME_SMOOTHING = 0.18;
const VOICE_SCALE = 0.14;
const VOICE_PINCH = 0.3;

// The same palette as the Agent mode's border (components/mode-accent.tsx).
const AGENT_COLORS = ['#f97316', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981'];

// The voice page's mark: Zetora's Z inside four rippling orbits. In Zetora mode the orbits
// take the text color and the Z the brand color, like the sidebar logo; in Hermes mode the
// orbits take the Agent mode's multicolor sweep and the Z the text color. The orbits swell
// with the voice that is speaking: the assistant's while it talks, the user's while it
// listens. Drawn on a canvas because a conic gradient clipped to strokes has no portable
// SVG form.
export function VoiceMark({
  mode,
  agentState,
  inputVolumeRef,
  outputVolumeRef,
  className,
}: {
  mode: VoiceMarkMode;
  agentState: AgentState;
  inputVolumeRef: React.RefObject<number>;
  outputVolumeRef: React.RefObject<number>;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zRef = useRef<SVGGElement>(null);
  const reducedMotion = useReducedMotion() ?? false;
  // Read by the animation loop, which must not restart on every change.
  const stateRef = useRef({ mode, agentState, reducedMotion });
  useEffect(() => {
    stateRef.current = { mode, agentState, reducedMotion };
  }, [mode, agentState, reducedMotion]);
  const accentStyle = useModeAccentStyle(mode);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    let frame = 0;
    let last = performance.now();
    let clock = 0;
    let level = 0;
    let hermesMix = stateRef.current.mode === 'hermes' ? 1 : 0;

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const { mode: currentMode, agentState: state, reducedMotion: still } = stateRef.current;
      if (!still) clock += dt;

      const volume = state === 'talking' ? outputVolumeRef.current : state === 'listening' ? inputVolumeRef.current : 0;
      level += (Math.min(1, (volume ?? 0) * VOLUME_GAIN) - level) * VOLUME_SMOOTHING;
      const target = currentMode === 'hermes' ? 1 : 0;
      hermesMix += Math.sign(target - hermesMix) * Math.min(Math.abs(target - hermesMix), dt / MODE_FADE_S);

      const pixels = Math.round(canvas.clientWidth * (window.devicePixelRatio || 1));
      if (canvas.width !== pixels || canvas.height !== pixels) {
        canvas.width = pixels;
        canvas.height = pixels;
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      // The 0-100 box, with room for the orbits to swell past it.
      const unit = (canvas.width / 100) * (1 / (1 + VOICE_SCALE));
      context.setTransform(unit, 0, 0, unit, canvas.width / 2, canvas.height / 2);
      const scale = 1 + level * VOICE_SCALE;
      context.scale(scale, scale);
      context.lineWidth = STROKE_WIDTH;
      context.lineCap = 'round';

      const sweep = createSweep(context, (clock / SWEEP_PERIOD_S) * Math.PI * 2);
      const textColor = getComputedStyle(canvas).color;
      for (let i = 0; i < ORBITS; i++) {
        // With reduced motion the orbits stay still and only the voice pinches them, evenly.
        const phase = clock / RIPPLE_PERIOD_S - i / ORBITS;
        const pinch = still ? 0 : (1 - Math.cos(phase * Math.PI * 2)) / 2;
        const ry = ORBIT_RY * (1 - pinch * RIPPLE_DEPTH - level * VOICE_PINCH * (still ? 0.5 : pinch));
        context.beginPath();
        context.ellipse(0, 0, ORBIT_RX, Math.max(ry, 1), (i * Math.PI) / ORBITS, 0, Math.PI * 2);
        if (hermesMix < 1) {
          context.globalAlpha = 1 - hermesMix;
          context.strokeStyle = textColor;
          context.stroke();
        }
        if (hermesMix > 0) {
          context.globalAlpha = hermesMix;
          context.strokeStyle = sweep;
          context.stroke();
        }
      }
      context.globalAlpha = 1;

      const breath = 1 + BREATH_DEPTH * ((1 - Math.cos((clock / RIPPLE_PERIOD_S) * Math.PI * 2)) / 2);
      zRef.current?.setAttribute('transform', `scale(${breath * (1 + level * VOICE_SCALE)})`);
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [inputVolumeRef, outputVolumeRef]);

  return (
    <div className={cn('relative rounded-full', className)} style={accentStyle}>
      <ModeAccentSpread selectedGroup={mode} />
      <canvas ref={canvasRef} className="absolute inset-0 size-full text-foreground" aria-hidden />
      <svg
        viewBox="-50 -50 100 100"
        className={cn(
          'absolute inset-0 size-full overflow-visible transition-colors',
          mode === 'hermes' ? 'text-foreground' : 'text-primary',
        )}
        style={{ transitionDuration: `${MODE_FADE_S}s`, padding: `${(VOICE_SCALE / (1 + VOICE_SCALE)) * 50}%` }}
        aria-hidden
      >
        <g ref={zRef}>
          <path d={Z_PATH} fill="currentColor" transform={`scale(${Z_SCALE}) translate(${-Z_WIDTH / 2} -50)`} />
        </g>
      </svg>
    </div>
  );
}

function createSweep(context: CanvasRenderingContext2D, angle: number): CanvasGradient {
  const gradient = context.createConicGradient(angle, 0, 0);
  AGENT_COLORS.forEach((color, i) => gradient.addColorStop(i / AGENT_COLORS.length, color));
  gradient.addColorStop(1, AGENT_COLORS[0]);
  return gradient;
}
