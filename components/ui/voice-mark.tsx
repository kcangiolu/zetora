'use client';

import { useEffect, useRef } from 'react';
import { Z_PATH } from '@/components/logos/zetora-logo';
import { ModeAccentSpread, useModeAccentStyle } from '@/components/mode-accent';
import { cn } from '@/lib/utils';

export type VoiceMarkMode = 'zetora' | 'hermes';
type AgentState = null | 'thinking' | 'listening' | 'talking';

// Geometry in a 0-100 box centered on the Z: four orbits 45° apart around it.
const ORBITS = 4;
const ORBIT_RX = 42;
const ORBIT_RY = 16;
const STROKE_WIDTH = 3.2;
const Z_SCALE = 0.27;
// The middle of Z_PATH's bounding box (x 3-84.1, y 3-97), the point the Z breathes around.
const Z_CENTER_X = 43.55;
const Z_CENTER_Y = 50;

// Each orbit pinches along its short axis in turn, a quarter period after the previous
// one, while the Z breathes in step with the first.
const RIPPLE_PERIOD_S = 3.8;
const RIPPLE_DEPTH = 0.24;
const BREATH_DEPTH = 0.16;
// Agent mode's rotating sweep (app/globals.css's .mode-accent-border).
const SWEEP_PERIOD_S = 4;
const MODE_FADE_S = 0.7;

// Speech RMS sits around 0.02-0.2: this gain brings a normal voice near 1.
const VOLUME_GAIN = 8;
const VOLUME_SMOOTHING = 0.18;
// At full voice the ripple runs this much faster and pinches this much deeper, and the Z
// swells this much on top of its breath, following the voice from one chunk to the next.
const VOICE_SPEED = 2.5;
const VOICE_DEPTH = 0.45;
const VOICE_SWELL = 0.14;

// The same palette as the Agent mode's border (components/mode-accent.tsx).
const AGENT_COLORS = ['#f97316', '#ec4899', '#8b5cf6', '#3b82f6', '#10b981'];

const Z_SHAPE = typeof Path2D === 'undefined' ? null : new Path2D(Z_PATH);

// The voice page's mark: Zetora's Z breathing inside four orbits that pinch in turn. In
// Zetora mode the orbits take the text color and the Z the brand color, like the sidebar
// logo; in Hermes mode the orbits take the Agent mode's multicolor sweep and the Z the text
// color. The mark is the assistant's presence: it ripples calmly all the time, even with
// reduced motion, and only the assistant's voice stirs it. Drawn on a canvas because a
// conic gradient clipped to strokes has no SVG form that every browser renders.
export function VoiceMark({
  mode,
  agentState,
  outputVolumeRef,
  className,
}: {
  mode: VoiceMarkMode;
  agentState: AgentState;
  outputVolumeRef: React.RefObject<number>;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Hidden elements that resolve the theme's colors for the canvas.
  const textColorRef = useRef<HTMLSpanElement>(null);
  const brandColorRef = useRef<HTMLSpanElement>(null);
  // Read by the animation loop, which must not restart on every change.
  const stateRef = useRef({ mode, agentState });
  useEffect(() => {
    stateRef.current = { mode, agentState };
  }, [mode, agentState]);
  const accentStyle = useModeAccentStyle(mode);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !Z_SHAPE) return;

    let frame = 0;
    let last = performance.now();
    let rippleClock = 0;
    let sweepClock = 0;
    let level = 0;
    let hermesMix = stateRef.current.mode === 'hermes' ? 1 : 0;

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const { mode: currentMode, agentState: state } = stateRef.current;

      const volume = state === 'talking' ? outputVolumeRef.current : 0;
      level += (Math.min(1, (volume ?? 0) * VOLUME_GAIN) - level) * VOLUME_SMOOTHING;
      rippleClock += (dt / RIPPLE_PERIOD_S) * (1 + level * VOICE_SPEED);
      sweepClock += dt / SWEEP_PERIOD_S;
      const target = currentMode === 'hermes' ? 1 : 0;
      hermesMix += Math.sign(target - hermesMix) * Math.min(Math.abs(target - hermesMix), dt / MODE_FADE_S);

      const pixels = Math.round(canvas.clientWidth * (window.devicePixelRatio || 1));
      if (canvas.width !== pixels || canvas.height !== pixels) {
        canvas.width = pixels;
        canvas.height = pixels;
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      const unit = canvas.width / 100;
      const toBox = () => context.setTransform(unit, 0, 0, unit, canvas.width / 2, canvas.height / 2);

      const textColor = textColorRef.current ? getComputedStyle(textColorRef.current).color : '';
      const brandColor = brandColorRef.current ? getComputedStyle(brandColorRef.current).color : '';
      const sweep = createSweep(context, sweepClock * Math.PI * 2);
      const depth = RIPPLE_DEPTH + level * VOICE_DEPTH;

      context.lineWidth = STROKE_WIDTH;
      context.lineCap = 'round';
      // Each orbit passes behind the Z on one side of its long axis and in front of it on
      // the other; alternate orbits come forward on opposite sides.
      const strokeHalves = (front: boolean) => {
        for (let i = 0; i < ORBITS; i++) {
          // Pinched in the orbit's own frame, stroke included, and the sweep is laid out in
          // that frame too: each orbit carries its own copy of it, turned with the orbit.
          const pinch = (1 - Math.cos((rippleClock - i / ORBITS) * Math.PI * 2)) / 2;
          const start = (i % 2 === 0) === front ? 0 : Math.PI;
          toBox();
          context.rotate((i * Math.PI) / ORBITS);
          context.scale(1, 1 - pinch * depth);
          context.beginPath();
          context.ellipse(0, 0, ORBIT_RX, ORBIT_RY, 0, start, start + Math.PI);
          crossfade(context, hermesMix, textColor, sweep, (style) => {
            context.strokeStyle = style;
            context.stroke();
          });
        }
      };

      strokeHalves(false);
      const breath = 1 + BREATH_DEPTH * ((1 - Math.cos(rippleClock * Math.PI * 2)) / 2) + level * VOICE_SWELL;
      toBox();
      context.scale(Z_SCALE * breath, Z_SCALE * breath);
      context.translate(-Z_CENTER_X, -Z_CENTER_Y);
      crossfade(context, hermesMix, brandColor, textColor, (style) => {
        context.fillStyle = style;
        context.fill(Z_SHAPE);
      });
      strokeHalves(true);

      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [outputVolumeRef]);

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

// Paints `to` at `mix` opacity over an opaque `from`, so halfway through a mode switch the
// mark blends the two instead of fading through transparency.
function crossfade(
  context: CanvasRenderingContext2D,
  mix: number,
  from: string | CanvasGradient,
  to: string | CanvasGradient,
  paint: (style: string | CanvasGradient) => void,
) {
  if (mix < 1) {
    context.globalAlpha = 1;
    paint(from);
  }
  if (mix > 0) {
    context.globalAlpha = mix;
    paint(to);
  }
  context.globalAlpha = 1;
}
