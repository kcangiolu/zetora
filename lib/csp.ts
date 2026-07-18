// Public legal pages skip strict framing rules — see next.config.ts's
// headers(), which exempts the same paths from X-Frame-Options so Google's
// OAuth verification crawler can iframe them.
const UNFRAMED_PATHS = ['/privacy-policy', '/terms', '/about'];

function isUnframedPath(pathname: string): boolean {
  return UNFRAMED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

interface BuiltCsp {
  nonce: string;
  header: string;
  value: string;
}

// Content-Security-Policy, started in report-only mode (see proxy.ts): it
// logs violations to the browser console without blocking anything, so it's
// safe to ship ahead of confirming every legitimate script/style/connect
// source is covered. Flip the header name to enforce once a normal pass
// through chat, search, markdown/math rendering, and the apps page shows no
// unexpected violations.
export function buildCsp(pathname: string): BuiltCsp {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const directives = [
    `default-src 'self'`,
    // 'strict-dynamic' makes browsers that support it ignore the nonce/host
    // allowlist distinction below and trust anything loaded by an
    // already-trusted (nonced) script — https: is a fallback for older
    // browsers without strict-dynamic support, ignored by newer ones.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:`,
    // Not nonce-gated: shiki (code blocks), MathJax, echarts and Radix all
    // set inline style="" attributes/<style> tags outside our control.
    // Script injection is the primary XSS vector this policy defends
    // against; a plain allowlisted style-src is the standard trade-off.
    `style-src 'self' 'unsafe-inline'`,
    // Search result thumbnails/favicons load from arbitrary domains (see
    // next.config.ts's images.remotePatterns wildcard).
    `img-src 'self' https: http: data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self' https: wss:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    isUnframedPath(pathname) ? `frame-ancestors 'self'` : `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ];

  return {
    nonce,
    header: 'Content-Security-Policy-Report-Only',
    value: directives.join('; '),
  };
}
