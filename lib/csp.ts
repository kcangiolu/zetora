// Public legal pages skip strict framing rules — see next.config.ts's
// headers(), which exempts the same paths from X-Frame-Options so Google's
// OAuth verification crawler can iframe them.
const UNFRAMED_PATHS = ['/privacy-policy', '/about'];

function isUnframedPath(pathname: string): boolean {
  return UNFRAMED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

// Report-only until a pass through chat, search, markdown/math rendering and
// the apps page shows no violations; then switch to 'content-security-policy'.
export const CSP_HEADER = 'content-security-policy-report-only';

export function buildCsp(pathname: string): string {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const directives = [
    `default-src 'self'`,
    // 'strict-dynamic' makes browsers that support it ignore the nonce/host
    // allowlist distinction below and trust anything loaded by an
    // already-trusted (nonced) script — https: is a fallback for older
    // browsers without strict-dynamic support, ignored by newer ones.
    // React's development build evaluates code for its debugging tools.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
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

  return directives.join('; ');
}

// The nonce of the policy proxy.ts set on the request, for inline scripts the
// app renders itself.
export function getNonceFromCsp(policy: string | null): string | undefined {
  return policy?.match(/'nonce-([^']+)'/)?.[1];
}
