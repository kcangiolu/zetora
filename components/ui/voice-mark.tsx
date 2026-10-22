'use client';

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { Z_PATH, Z_WIDTH } from '@/components/logos/zetora-logo';
import { ModeAccentSpread, useModeAccentStyle } from '@/components/mode-accent';
import { cn } from '@/lib/utils';

export type VoiceMarkMode = 'zetora' | 'hermes';
type AgentState = null | 'thinking' | 'listening' | 'talking';

// Geometry in a 0-100 box centered on the Z: four rings 45° apart around it.
const ORBITS = 4;
const ORBIT_RX = 42;
const ORBIT_RY = 16;
const STROKE_WIDTH = 3.2;
// The gap cut around a front half where it crosses the Z or a ring behind it.
const KNOCKOUT_WIDTH = STROKE_WIDTH + 2.4;
// The half of a ring behind the Z is fainter, so depth reads at a glance.
const BACK_ALPHA = 0.55;
const Z_SCALE = 0.27;

// Each ring turns on its long axis, an eighth of a turn behind the previous one: a ring
// seen edge-on crosses the Z, and with these offsets only one ring is at a time.
const TURN_PERIOD_S = 9.5;
const BREATH_PERIOD_S = 3.8;
const BREATH_DEPTH = 0.16;
// Agent mode's rotating sweep (app/globals.css's .mode-accent-border).
const SWEEP_PERIOD_S = 4;
const MODE_FADE_S = 0.7;

// Speech RMS sits around 0.02-0.2: this gain brings a normal voice near 1.
const VOLUME_GAIN = 5;
const VOLUME_SMOOTHING = 0.18;
const VOICE_SCALE = 0.14;
// How much faster the rings turn at full voice.
const VOICE_SPIN = 1.5;

// The same palette as the Agent mode's border (components/mode-accent.tsx).
const AGENT_COLORS = ['#f97316', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981'];

const Z_SHAPE = typeof Path2D === 'undefined' ? null : new Path2D(Z_PATH);

// The voice page's mark: Zetora's Z inside four rings turning around it in 3D, each half
// passing in front of the Z, then behind it. In Zetora mode the rings take the text color
// and the Z the brand color, like the sidebar logo; in Hermes mode the rings take the
// Agent mode's multicolor sweep and the Z the text color. The mark swells, and the rings
// turn faster, with the voice that is speaking: the assistant's while it talks, the user's
// while it listens. Drawn on a canvas because a conic gradient clipped to strokes has no
// SVG form that every browser renders.
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
  // Hidden elements that resolve the theme's colors for the canvas.
  const textColorRef = useRef<HTMLSpanElement>(null);
  const brandColorRef = useRef<HTMLSpanElement>(null);
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
    if (!canvas || !context || !Z_SHAPE) return;

    let frame = 0;
    let last = performance.now();
    let turn = 0;
    let breathClock = 0;
    let sweepClock = 0;
    let level = 0;
    let hermesMix = stateRef.current.mode === 'hermes' ? 1 : 0;

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const { mode: currentMode, agentState: state, reducedMotion: still } = stateRef.current;

      const volume = state === 'talking' ? outputVolumeRef.current : state === 'listening' ? inputVolumeRef.current : 0;
      level += (Math.min(1, (volume ?? 0) * VOLUME_GAIN) - level) * VOLUME_SMOOTHING;
      // With reduced motion only the voice moves the mark.
      if (!still) {
        turn += (dt / TURN_PERIOD_S) * (1 + level * VOICE_SPIN);
        breathClock += dt / BREATH_PERIOD_S;
        sweepClock += dt / SWEEP_PERIOD_S;
      } else {
        turn += (dt / TURN_PERIOD_S) * level * VOICE_SPIN;
      }
      const target = currentMode === 'hermes' ? 1 : 0;
      hermesMix += Math.sign(target - hermesMix) * Math.min(Math.abs(target - hermesMix), dt / MODE_FADE_S);

      const pixels = Math.round(canvas.clientWidth * (window.devicePixelRatio || 1));
      if (canvas.width !== pixels || canvas.height !== pixels) {
        canvas.width = pixels;
        canvas.height = pixels;
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      // The 0-100 box, with room for the mark to swell past it.
      const unit = (canvas.width / 100) * (1 / (1 + VOICE_SCALE));
      const scale = 1 + level * VOICE_SCALE;
      context.setTransform(unit * scale, 0, 0, unit * scale, canvas.width / 2, canvas.height / 2);
      context.lineCap = 'round';

      const textColor = textColorRef.current ? getComputedStyle(textColorRef.current).color : '';
      const brandColor = brandColorRef.current ? getComputedStyle(brandColorRef.current).color : '';
      const sweep = createSweep(context, sweepClock * Math.PI * 2);

      // A ring turning on its long axis projects to an ellipse whose short radius follows
      // cos(angle); the half on the side the ring tilts toward is in front.
      const rings = Array.from({ length: ORBITS }, (_, i) => {
        const tilt = Math.cos((turn - i / (2 * ORBITS)) * Math.PI * 2);
        return {
          rotation: (i * Math.PI) / ORBITS,
          ry: Math.max(Math.abs(tilt) * ORBIT_RY, 0.5),
          front: tilt >= 0 ? ([0, Math.PI] as const) : ([Math.PI, Math.PI * 2] as const),
        };
      });
      const arc = (ring: (typeof rings)[number], [start, end]: readonly [number, number]) => {
        context.beginPath();
        context.ellipse(0, 0, ORBIT_RX, ring.ry, ring.rotation, start, end);
      };
      const strokeRing = (alpha: number) => {
        context.lineWidth = STROKE_WIDTH;
        if (hermesMix < 1) {
          context.globalAlpha = alpha * (1 - hermesMix);
          context.strokeStyle = textColor;
          context.stroke();
        }
        if (hermesMix > 0) {
          context.globalAlpha = alpha * hermesMix;
          context.strokeStyle = sweep;
          context.stroke();
        }
      };

      for (const ring of rings) {
        arc(ring, [ring.front[1], ring.front[0] + Math.PI * 2]);
        strokeRing(BACK_ALPHA);
      }

      context.save();
      const breath = 1 + BREATH_DEPTH * ((1 - Math.cos(breathClock * Math.PI * 2)) / 2);
      context.scale(Z_SCALE * breath, Z_SCALE * breath);
      context.translate(-Z_WIDTH / 2, -50);
      context.globalAlpha = 1 - hermesMix;
      context.fillStyle = brandColor;
      context.fill(Z_SHAPE);
      context.globalAlpha = hermesMix;
      context.fillStyle = textColor;
      context.fill(Z_SHAPE);
      context.restore();

      for (const ring of rings) {
        arc(ring, ring.front);
        context.globalCompositeOperation = 'destination-out';
        context.globalAlpha = 1;
        context.lineWidth = KNOCKOUT_WIDTH;
        context.stroke();
        context.globalCompositeOperation = 'source-over';
        strokeRing(1);
      }
      context.globalAlpha = 1;

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [inputVolumeRef, outputVolumeRef]);

  return (
    <div className={cn('relative rounded-full', className)} style={accentStyle}>
      <ModeAccentSpread selectedGroup={mode} />
      <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden />
      <span ref={textColorRef} className="hidden text-foreground" />
      <span ref={brandColorRef} className="hidden text-primary" />
    </div>
  );
}

function createSweep(context: CanvasRenderingContext2D, angle: number): CanvasGradient {
  const gradient = context.createConicGradient(angle, 0, 0);
  AGENT_COLORS.forEach((color, i) => gradient.addColorStop(i / AGENT_COLORS.length, color));
  gradient.addColorStop(1, AGENT_COLORS[0]);
  return gradient;
}
