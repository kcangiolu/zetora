import { cn } from '@/lib/utils';

export type FileFilter = 'all' | 'images' | 'documents';

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Mirror the MIME types & extensions supported by /api/upload/route.ts
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif'];

const FILE_TYPES = {
  image: { mimes: IMAGE_MIMES, exts: IMAGE_EXTENSIONS },
  pdf: { mimes: ['application/pdf'], exts: ['.pdf'] },
  csv: { mimes: ['text/csv'], exts: ['.csv'] },
  docx: { mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], exts: ['.docx'] },
  xlsx: {
    mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'],
    exts: ['.xlsx', '.xls'],
  },
  pptx: {
    mimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    exts: ['.pptx'],
  },
} as const;

export type DetectedType = keyof typeof FILE_TYPES;

export function detectFileType(mediaType: string | null, filename: string): DetectedType | 'unknown' {
  const mt = (mediaType ?? '').toLowerCase();
  const name = filename.toLowerCase();
  for (const [type, { mimes, exts }] of Object.entries(FILE_TYPES) as [
    DetectedType,
    { mimes: readonly string[]; exts: readonly string[] },
  ][]) {
    if (mimes.some((m) => mt === m) || exts.some((e) => name.endsWith(e))) return type;
  }
  return 'unknown';
}

export function FileTypeIcon({
  mediaType,
  filename,
  className,
}: {
  mediaType: string | null;
  filename: string;
  className?: string;
}) {
  const type = detectFileType(mediaType, filename);
  const base = cn(
    'shrink-0 text-[10px] font-bold font-mono uppercase tracking-tight flex items-center justify-center rounded w-7 h-7',
    className,
  );

  const styles: Record<DetectedType | 'unknown', [string, string]> = {
    image: ['bg-violet-500/10 text-violet-500', 'IMG'],
    pdf: ['bg-red-500/10 text-red-500', 'PDF'],
    csv: ['bg-green-500/10 text-green-600', 'CSV'],
    docx: ['bg-blue-500/10 text-blue-500', 'DOC'],
    xlsx: ['bg-emerald-500/10 text-emerald-600', 'XLS'],
    pptx: ['bg-orange-500/10 text-orange-500', 'PPT'],
    unknown: ['bg-muted text-muted-foreground', 'FILE'],
  };

  const [style, label] = styles[type];
  return <div className={cn(base, style)}>{label}</div>;
}
