import { rgb, type PDFPage } from 'pdf-lib';

import { Z_PATH } from '@/components/logos/zetora-logo';

// Draw the Zetora Z mark (vector) from the same path as components/logos/zetora-logo.tsx,
// in its 100 x 100 viewBox. Positions the logo with its top-left at (x, yTop). Width
// controls overall size. Returns its height.
export function drawZetoraLogo(page: PDFPage, x: number, yTop: number, width: number, color = rgb(0, 0, 0)) {
  const scale = width / 100;
  // drawSvgPath anchors the path's own origin at (x, y) and keeps SVG's y-down axis,
  // so the viewBox top-left lands on yTop.
  page.drawSvgPath(Z_PATH, { x, y: yTop, scale, color });
  return 100 * scale;
}
