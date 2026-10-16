import React from 'react';
import {
  type LucideIcon,
  Download,
  File as FileIcon,
  FileText,
  FileArchive,
  FileCode2,
  Image as ImageIcon,
  Music4,
  Video,
  FileSpreadsheet,
} from 'lucide-react';

export const SpotifyIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
  </svg>
);

// Helper to detect platform from URL
export const getPlatformFromUrl = (url: string): 'youtube' | 'spotify' | null => {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      return 'youtube';
    }
    if (hostname.includes('spotify.com')) {
      return 'spotify';
    }
  } catch {
    // Invalid URL
  }
  return null;
};

// Helper to get a compact, TLD-stripped domain label for display
export const getDisplayDomain = (input: string): string => {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Strip protocol and path if present
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, '');
  const hostOnly = withoutProtocol.split('/')[0];

  // Remove common www prefix
  const withoutWww = hostOnly.replace(/^www\./i, '');

  const parts = withoutWww.split('.');
  if (parts.length <= 1) return withoutWww;

  // Drop only the final TLD segment: timesofindia.com -> timesofindia
  return parts.slice(0, -1).join('.');
};

export interface FilePreviewDefinition {
  filename: string;
  title: string;
  typeLabel: string;
  icon: LucideIcon;
}

export interface TaggedLinkData {
  href: string;
  title?: string;
}

const NON_DOWNLOADABLE_EXTENSIONS = new Set(['html', 'htm', 'php', 'asp', 'aspx', 'jsp']);

const FILE_TYPE_MAP: Record<string, { typeLabel: string; icon: LucideIcon }> = {
  pdf: { typeLabel: 'PDF', icon: FileText },
  doc: { typeLabel: 'DOC', icon: FileText },
  docx: { typeLabel: 'DOCX', icon: FileText },
  txt: { typeLabel: 'TXT', icon: FileText },
  md: { typeLabel: 'Markdown', icon: FileText },
  rtf: { typeLabel: 'RTF', icon: FileText },
  csv: { typeLabel: 'CSV', icon: FileSpreadsheet },
  xls: { typeLabel: 'XLS', icon: FileSpreadsheet },
  xlsx: { typeLabel: 'XLSX', icon: FileSpreadsheet },
  ods: { typeLabel: 'ODS', icon: FileSpreadsheet },
  png: { typeLabel: 'PNG', icon: ImageIcon },
  jpg: { typeLabel: 'JPG', icon: ImageIcon },
  jpeg: { typeLabel: 'JPEG', icon: ImageIcon },
  webp: { typeLabel: 'WEBP', icon: ImageIcon },
  gif: { typeLabel: 'GIF', icon: ImageIcon },
  svg: { typeLabel: 'SVG', icon: ImageIcon },
  ico: { typeLabel: 'ICO', icon: ImageIcon },
  mp3: { typeLabel: 'MP3', icon: Music4 },
  wav: { typeLabel: 'WAV', icon: Music4 },
  m4a: { typeLabel: 'M4A', icon: Music4 },
  flac: { typeLabel: 'FLAC', icon: Music4 },
  ogg: { typeLabel: 'OGG', icon: Music4 },
  mp4: { typeLabel: 'MP4', icon: Video },
  mov: { typeLabel: 'MOV', icon: Video },
  webm: { typeLabel: 'WEBM', icon: Video },
  mkv: { typeLabel: 'MKV', icon: Video },
  avi: { typeLabel: 'AVI', icon: Video },
  zip: { typeLabel: 'ZIP', icon: FileArchive },
  tar: { typeLabel: 'TAR', icon: FileArchive },
  gz: { typeLabel: 'GZ', icon: FileArchive },
  tgz: { typeLabel: 'TGZ', icon: FileArchive },
  rar: { typeLabel: 'RAR', icon: FileArchive },
  '7z': { typeLabel: '7Z', icon: FileArchive },
  ts: { typeLabel: 'TypeScript', icon: FileCode2 },
  tsx: { typeLabel: 'TSX', icon: FileCode2 },
  js: { typeLabel: 'JavaScript', icon: FileCode2 },
  jsx: { typeLabel: 'JSX', icon: FileCode2 },
  json: { typeLabel: 'JSON', icon: FileCode2 },
  yaml: { typeLabel: 'YAML', icon: FileCode2 },
  yml: { typeLabel: 'YML', icon: FileCode2 },
  toml: { typeLabel: 'TOML', icon: FileCode2 },
  xml: { typeLabel: 'XML', icon: FileCode2 },
  css: { typeLabel: 'CSS', icon: FileCode2 },
  scss: { typeLabel: 'SCSS', icon: FileCode2 },
  htmlx: { typeLabel: 'HTML', icon: FileCode2 },
  sh: { typeLabel: 'Shell', icon: FileCode2 },
  bash: { typeLabel: 'Bash', icon: FileCode2 },
  zsh: { typeLabel: 'Zsh', icon: FileCode2 },
  py: { typeLabel: 'Python', icon: FileCode2 },
  rb: { typeLabel: 'Ruby', icon: FileCode2 },
  go: { typeLabel: 'Go', icon: FileCode2 },
  rs: { typeLabel: 'Rust', icon: FileCode2 },
  java: { typeLabel: 'Java', icon: FileCode2 },
  sql: { typeLabel: 'SQL', icon: FileCode2 },
  apk: { typeLabel: 'APK', icon: Download },
  dmg: { typeLabel: 'DMG', icon: Download },
  exe: { typeLabel: 'EXE', icon: Download },
  msi: { typeLabel: 'MSI', icon: Download },
  pkg: { typeLabel: 'PKG', icon: Download },
  deb: { typeLabel: 'DEB', icon: Download },
  rpm: { typeLabel: 'RPM', icon: Download },
};

function parseUrlLike(href: string): URL | null {
  try {
    if (href.startsWith('/'))
      return new URL(href, process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'http://localhost:3000');
    return new URL(href);
  } catch {
    return null;
  }
}

export function getAppPreviewDescription(href: string): string {
  const url = parseUrlLike(href);
  if (!url) return href;

  if (href.startsWith('/')) {
    const suffix = `${url.search}${url.hash}`;
    return `${url.pathname}${suffix}` || '/';
  }

  const host = url.hostname.replace(/^www\./, '');
  const suffix = `${url.pathname}${url.search}${url.hash}`;
  return `${host}${suffix}`;
}

function extractFilenameFromHref(href: string, fallbackText?: string): string {
  const url = parseUrlLike(href);
  const rawPathSegment = url?.pathname.split('/').filter(Boolean).pop();
  const decodedPathSegment = rawPathSegment ? decodeURIComponent(rawPathSegment) : '';

  if (decodedPathSegment) return decodedPathSegment;

  const candidateFromText = fallbackText?.trim();
  if (candidateFromText && candidateFromText.includes('.')) return candidateFromText;

  return 'download';
}

export function getFilePreviewDefinition(href: string, fallbackText?: string): FilePreviewDefinition | null {
  const url = parseUrlLike(href);
  const pathname = url?.pathname ?? '';
  const filename = extractFilenameFromHref(href, fallbackText);
  const ext = filename.includes('.') ? (filename.split('.').pop()?.toLowerCase() ?? '') : '';
  const hasBuildDownloadPath = pathname.includes('/zetora/builds/');
  const hasKnownDownloadExtension = Boolean(ext && FILE_TYPE_MAP[ext] && !NON_DOWNLOADABLE_EXTENSIONS.has(ext));
  const hasDownloadHint =
    url?.searchParams.get('download') === '1' ||
    url?.searchParams.get('download') === 'true' ||
    url?.searchParams.has('filename');

  const isLikelyFile = hasBuildDownloadPath || hasKnownDownloadExtension || Boolean(hasDownloadHint);

  if (!isLikelyFile) return null;

  const matchedType = (ext && FILE_TYPE_MAP[ext]) || null;
  return {
    filename,
    title: fallbackText?.trim() && fallbackText.trim() !== href ? fallbackText.trim() : filename,
    typeLabel: matchedType?.typeLabel ?? (ext ? ext.toUpperCase() : 'File'),
    icon: matchedType?.icon ?? FileIcon,
  };
}

export function parseTaggedLinkContent(raw: string): TaggedLinkData | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const markdownLinkMatch = trimmed.match(/^\[([^\]]+)\]\(([^)]+)\)$/s);
  if (markdownLinkMatch) {
    return {
      title: markdownLinkMatch[1].trim(),
      href: markdownLinkMatch[2].trim(),
    };
  }

  return { href: trimmed };
}

export interface CitationLink {
  text: string;
  link: string;
  metadata?: {
    title?: string;
    description?: string;
    image?: string;
    logo?: string;
  };
}

export interface CitationGroup {
  urls: string[];
  texts: string[];
  id: string;
}
