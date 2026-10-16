import { cn } from '@/lib/utils';
import { getHostFaviconUrl } from '@/lib/url';

// Second-level TLDs that need 3 parts kept (e.g. mospi.gov.in → gov.in is the TLD)
const SLD_TLDS = new Set([
  'gov.in',
  'co.in',
  'org.in',
  'net.in',
  'ac.in',
  'co.uk',
  'org.uk',
  'me.uk',
  'net.uk',
  'ac.uk',
  'co.jp',
  'co.nz',
  'co.za',
  'co.kr',
  'co.il',
  'com.au',
  'net.au',
  'org.au',
  'com.br',
  'net.br',
  'org.br',
  'nih.gov',
]);

function rootDomain(serverUrl: string): string {
  try {
    const parts = new URL(serverUrl).hostname.split('.');
    if (parts.length <= 2) return parts.join('.');
    const last2 = parts.slice(-2).join('.');
    if (SLD_TLDS.has(last2)) return parts.slice(-3).join('.');
    return last2;
  } catch {
    return '';
  }
}

function faviconUrl(serverUrl: string): string {
  const domain = rootDomain(serverUrl);
  if (!domain) return '';
  return `/api/proxy-image?url=${encodeURIComponent(getHostFaviconUrl(domain))}`;
}

// The favicon of the MCP server's root domain, or its initials when the URL
// doesn't parse. Decorative: callers always show the name next to it.
export function ServiceIcon({
  url,
  name,
  size = 24,
  className,
}: {
  url: string;
  name: string;
  size?: number;
  className?: string;
}) {
  const src = faviconUrl(url);
  return src ? (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={cn('object-contain rounded', className)}
      loading="lazy"
    />
  ) : (
    <span
      className={cn(
        'flex items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground/70',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
