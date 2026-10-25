// Full "Zetora" logotype: the same Z trace as ZetoraLogo, followed by
// e-t-o-r-a built from the same geometric vocabulary (chamfered slab
// strokes + cut rings) rather than a typeface. Tuned interactively in
// "Atelier du logotype"; the constants below are the values validated there.
//
// Browser-only: the e/o/a counters are punched with an SVG <mask>, which
// Satori (next/og) doesn't support. For Satori contexts (OG images), use
// ZetoraLogo (the Z alone) instead.

import { useId } from 'react';
import { Z_PATH, Z_WIDTH } from './zetora-logo';

const BASE = 100;
const WM = { xh: 58, stroke: 15, chamfer: 35, gap: 12 };

function pt(x: number, y: number) {
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}

type Corners = { tl?: boolean; tr?: boolean; bl?: boolean; br?: boolean };

function chamferPoly(x0: number, y0: number, x1: number, y1: number, c: number, corners?: Corners) {
  const { tl = true, tr = true, bl = true, br = true } = corners ?? {};
  const cl = tl ? c : 0;
  const cr = tr ? c : 0;
  const cbl = bl ? c : 0;
  const cbr = br ? c : 0;
  const p: [number, number][] = [
    [x0 + cl, y0],
    [x1 - cr, y0],
    [x1, y0 + cr],
    [x1, y1 - cbr],
    [x1 - cbr, y1],
    [x0 + cbl, y1],
    [x0, y1 - cbl],
    [x0, y0 + cl],
  ];
  return `M ${p.map(([x, y]) => pt(x, y)).join(' L ')} Z`;
}

function buildWordmark() {
  const XH_TOP = BASE - WM.xh;
  const T = WM.stroke;
  const C = T * (WM.chamfer / 100);
  const solid: string[] = [];
  const holes: string[] = [];
  const addRing = (x0: number, y0: number, x1: number, y1: number) => {
    solid.push(chamferPoly(x0, y0, x1, y1, C));
    holes.push(chamferPoly(x0 + T, y0 + T, x1 - T, y1 - T, 0));
  };

  let x = Z_WIDTH + WM.gap;

  // e — the hollow is split into an upper and lower band so the crossbar
  // (which sits between them) isn't masked away by the ring's own hole
  {
    const x0 = x;
    const w = WM.xh * 0.9;
    const x1 = x0 + w;
    const midY = XH_TOP + (BASE - XH_TOP) / 2;
    const barTop = midY - T / 2;
    const barBot = midY + T / 2;
    solid.push(chamferPoly(x0, XH_TOP, x1, BASE, C));
    solid.push(
      `M ${pt(x0 + T * 0.5, barTop)} L ${pt(x1 - T * 0.5, barTop)} L ${pt(x1 - T * 0.5, barBot)} L ${pt(x0 + T * 0.5, barBot)} Z`,
    );
    const hx0 = x0 + T;
    const hx1 = x1 - T;
    holes.push(`M ${pt(hx0, XH_TOP + T)} L ${pt(hx1, XH_TOP + T)} L ${pt(hx1, barTop)} L ${pt(hx0, barTop)} Z`);
    holes.push(`M ${pt(hx0, barBot)} L ${pt(hx1, barBot)} L ${pt(hx1, BASE - T)} L ${pt(hx0, BASE - T)} Z`);
    holes.push(
      `M ${pt(x1 - T - 3, barTop - T * 0.05)} L ${pt(x1 + 3, barTop - T * 0.05)} L ${pt(x1 + 3, barBot + T * 0.05)} L ${pt(x1 - T - 3, barBot + T * 0.05)} Z`,
    );
    x = x1 + WM.gap;
  }

  // t
  {
    const w = WM.xh * 0.72;
    const x0 = x;
    const x1 = x0 + w;
    const ascTop = XH_TOP - (BASE - XH_TOP) * 0.38;
    const stemX0 = x0 + (w - T) / 2;
    const stemX1 = stemX0 + T;
    solid.push(chamferPoly(stemX0, ascTop, stemX1, BASE, C, { tl: true, tr: true, bl: false, br: false }));
    solid.push(chamferPoly(x0, XH_TOP - T * 0.15, x1, XH_TOP + T * 0.85, C * 0.6));
    x = x1 + WM.gap;
  }

  // o
  {
    const w = WM.xh * 0.9;
    const x0 = x;
    const x1 = x0 + w;
    addRing(x0, XH_TOP, x1, BASE);
    x = x1 + WM.gap;
  }

  // r
  {
    const w = WM.xh * 0.68;
    const x0 = x;
    const x1 = x0 + w;
    solid.push(chamferPoly(x0, XH_TOP, x0 + T, BASE, C, { tl: true, tr: true, bl: false, br: false }));
    solid.push(
      chamferPoly(x0 + T, XH_TOP, x1, XH_TOP + T * 0.85, C * 0.6, { tl: false, tr: true, bl: false, br: false }),
    );
    x = x1 + WM.gap;
  }

  // a
  {
    const w = WM.xh * 0.9;
    const x0 = x;
    const x1 = x0 + w;
    const bowlH = (BASE - XH_TOP) * 0.72;
    addRing(x0, BASE - bowlH, x1, BASE);
    solid.push(chamferPoly(x1 - T, XH_TOP, x1, BASE, C, { tl: true, tr: true, bl: false, br: false }));
    const earW = w * 0.34;
    solid.push(
      chamferPoly(x1 - T - earW, XH_TOP, x1, XH_TOP + T * 0.75, C * 0.6, { tl: true, tr: false, bl: false, br: false }),
    );
    x = x1 + WM.gap;
  }

  return { solidPath: solid.join(' '), holePath: holes.join(' '), totalW: x - WM.gap };
}

const WORDMARK = buildWordmark();
const VIEW_W = WORDMARK.totalW + 6;

export function ZetoraWordmark({
  className,
  height,
  color = 'currentColor',
}: {
  className?: string;
  height?: number;
  color?: string;
}) {
  const maskId = `zetora-wordmark-mask-${useId()}`;
  const width = height ? Math.round(height * (VIEW_W / 112)) : undefined;
  return (
    <svg
      viewBox={`-3 -6 ${VIEW_W} 112`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      width={width}
      height={height}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x={-10} y={-10} width={VIEW_W + 20} height={132}>
          <rect x={-10} y={-10} width={VIEW_W + 20} height={132} fill="#fff" />
          <path d={WORDMARK.holePath} fill="#000" />
        </mask>
      </defs>
      <path d={WORDMARK.solidPath} fill={color} mask={`url(#${maskId})`} />
      <path d={Z_PATH} fill={color} />
    </svg>
  );
}
