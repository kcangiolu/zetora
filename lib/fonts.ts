import localFont from 'next/font/local';

// Every font ships from an npm package rather than being fetched from Google Fonts at build
// time, so a build never depends on that CDN being reachable. next/font only accepts
// literal arguments, hence one entry per file. Latin files only, as the app served before.

export const geist = localFont({
  src: '../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2',
  variable: '--font-sans',
  weight: '100 900',
  display: 'swap',
});

export const geistMono = localFont({
  src: '../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2',
  variable: '--font-mono',
  weight: '100 900',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
});

export const beVietnamPro = localFont({
  src: [
    { path: '../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-100-normal.woff2', weight: '100' },
    { path: '../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-200-normal.woff2', weight: '200' },
    { path: '../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-300-normal.woff2', weight: '300' },
    { path: '../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-400-normal.woff2', weight: '400' },
    { path: '../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-500-normal.woff2', weight: '500' },
    { path: '../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-600-normal.woff2', weight: '600' },
    { path: '../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-700-normal.woff2', weight: '700' },
    { path: '../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-800-normal.woff2', weight: '800' },
    { path: '../node_modules/@fontsource/be-vietnam-pro/files/be-vietnam-pro-latin-900-normal.woff2', weight: '900' },
  ],
  variable: '--font-be-vietnam-pro',
  display: 'swap',
});

export const baumans = localFont({
  src: '../node_modules/@fontsource/baumans/files/baumans-latin-400-normal.woff2',
  variable: '--font-baumans',
  weight: '400',
  display: 'swap',
});

export const instrumentSerif = localFont({
  src: [
    {
      path: '../node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2',
      style: 'normal',
    },
    {
      path: '../node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2',
      style: 'italic',
    },
  ],
  variable: '--font-instrument-serif',
  weight: '400',
  display: 'swap',
});
