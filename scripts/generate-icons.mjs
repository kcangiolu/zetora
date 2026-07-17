// Regenerates all raster/vector icon assets from the Zetora "Dérive" mark
// (four crossed orbits + pupil — see components/logos/zetora-logo.tsx).
// Usage: node scripts/generate-icons.mjs
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import sharp from 'sharp';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Stroke/pupil scale up at small sizes so the mark stays legible at 16px.
function logoInner(stroke, pupil, color, angles = [0, 45, 90, 135]) {
  const orbits = angles
    .map(
      (a) =>
        `<ellipse cx="50" cy="50" rx="42" ry="16" transform="rotate(${a} 50 50)" fill="none" stroke="${color}" stroke-width="${stroke}"/>`,
    )
    .join('');
  return orbits + `<circle cx="50" cy="50" r="${pupil}" fill="${color}"/>`;
}

function iconSvg(size, { stroke = 4, pupil = 9, bg = '#ffffff', color = '#000000', content = 0.88, angles } = {}) {
  const s = (size * content) / 100;
  const t = (size - 100 * s) / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    (bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : '') +
    `<g transform="translate(${t} ${t}) scale(${s})">${logoInner(stroke, pupil, color, angles)}</g></svg>`
  );
}

const png = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

// ICO container wrapping PNG entries (supported by all modern browsers)
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + 16 * entries.length;
  const dirs = [];
  for (const { size, buf } of entries) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(size >= 256 ? 0 : size, 0);
    dir.writeUInt8(size >= 256 ? 0 : size, 1);
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(buf.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += buf.length;
    dirs.push(dir);
  }
  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.buf)]);
}

writeFileSync(`${ROOT}/app/icon.png`, await png(iconSvg(512)));
writeFileSync(`${ROOT}/public/zetora.png`, await png(iconSvg(512)));

// Maskable: logo inside the 80% safe zone
writeFileSync(`${ROOT}/public/icon-maskable.png`, await png(iconSvg(1024, { content: 0.64 })));

// Favicon: 16px drops to 2 orbits + bigger pupil, otherwise it muddies
const ico = buildIco([
  { size: 16, buf: await png(iconSvg(16, { stroke: 9, pupil: 15, content: 1, angles: [0, 90] })) },
  { size: 32, buf: await png(iconSvg(32, { stroke: 4.5, pupil: 11, content: 0.96 })) },
  { size: 48, buf: await png(iconSvg(48, { stroke: 4.5, pupil: 10, content: 0.94 })) },
]);
writeFileSync(`${ROOT}/app/favicon.ico`, ico);

// True vector favicon, theme-aware where supported
const faviconSvg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
  `<style>.z{stroke:#000}.p{fill:#000}@media (prefers-color-scheme:dark){.z{stroke:#fff}.p{fill:#fff}}</style>` +
  [0, 45, 90, 135]
    .map(
      (a) =>
        `<ellipse class="z" cx="50" cy="50" rx="42" ry="16" transform="rotate(${a} 50 50)" fill="none" stroke-width="5"/>`,
    )
    .join('') +
  `<circle class="p" cx="50" cy="50" r="10"/></svg>`;
writeFileSync(`${ROOT}/app/favicon.svg`, faviconSvg);

console.log('Icons regenerated: app/icon.png, app/favicon.ico, app/favicon.svg, public/zetora.png, public/icon-maskable.png');
