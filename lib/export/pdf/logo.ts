import { rgb, type PDFPage } from 'pdf-lib';

// Draw the Zetora logo (vector) using the same geometry as components/logos/zetora-logo.tsx:
// four crossed orbits (rotated ellipses) around a filled pupil, viewBox 100 x 100.
// Positions the logo with its top-left at (x, yTop). Width controls overall size.
// Returns its height.
export function drawZetoraLogo(page: PDFPage, x: number, yTop: number, width: number, color = rgb(0, 0, 0)) {
  const vbW = 100;
  const vbH = 100;
  const scale = width / vbW;
  const height = vbH * scale;
  const y = yTop - height; // convert to bottom-left anchor for PDF

  const border = (w: number) => Math.max(0.5, w * scale);

  // pdf-lib's drawSvgPath has no arc support, so ellipses are approximated
  // with four cubic Béziers (kappa), rotated around the viewBox center.
  const rotatedEllipsePath = (cx: number, cy: number, rx: number, ry: number, deg: number) => {
    const k = 0.5522847498;
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const pt = (px: number, py: number) =>
      `${(cx + px * cos - py * sin).toFixed(3)} ${(cy + px * sin + py * cos).toFixed(3)}`;
    return (
      `M ${pt(rx, 0)} ` +
      `C ${pt(rx, ry * k)} ${pt(rx * k, ry)} ${pt(0, ry)} ` +
      `C ${pt(-rx * k, ry)} ${pt(-rx, ry * k)} ${pt(-rx, 0)} ` +
      `C ${pt(-rx, -ry * k)} ${pt(-rx * k, -ry)} ${pt(0, -ry)} ` +
      `C ${pt(rx * k, -ry)} ${pt(rx, -ry * k)} ${pt(rx, 0)} Z`
    );
  };

  for (const angle of [0, 45, 90, 135]) {
    page.drawSvgPath(rotatedEllipsePath(50, 50, 42, 16, angle), {
      x,
      y,
      scale,
      borderColor: color,
      borderWidth: border(4),
    });
  }
  page.drawSvgPath(rotatedEllipsePath(50, 50, 9, 9, 0), { x, y, scale, color });

  return height;
}
