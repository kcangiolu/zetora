import { AlertCircle, X } from 'lucide-react';
import { FileDoc, FileMd, FilePdf } from '@phosphor-icons/react';
import { sileo } from 'sileo';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ChatMessage } from '@/lib/types';

import { ActionTooltip, actionIconButtonClassName } from './action-button';
import { IconArrowInbox } from './shared';

// The answer's links, collected into a References section after its text.
export function buildMarkdownExport(content: string): string {
  const links: { text: string; url: string }[] = [];
  const seen = new Set<string>();
  const add = (text: string, rawUrl: string) => {
    const url = rawUrl.replace(/[.,;:]+$/, '');
    if (seen.has(url)) return;
    seen.add(url);
    links.push({ text: text === rawUrl ? url : text, url });
  };
  for (const [, text, url] of content.matchAll(/\[([^\]]+)]\((https?:\/\/[^\s)]+)\)/g)) add(text, url);
  for (const [, url] of content.matchAll(/(?:^|\s)(https?:\/\/[^\s)]+)(?=$|\s)/g)) add(url, url);
  if (links.length === 0) return content;
  return `${content}\n\n## References\n\n${links.map((l) => `- [${l.text}](${l.url})`).join('\n')}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const FORMATS = {
  pdf: { label: 'PDF', name: 'PDF', icon: FilePdf, extension: 'pdf' },
  docx: { label: 'Word', name: 'Word document', icon: FileDoc, extension: 'docx' },
  md: { label: 'Markdown', name: 'Markdown', icon: FileMd, extension: 'md' },
} as const;

type ExportFormat = keyof typeof FORMATS;

async function renderExport(format: ExportFormat, content: string, meta: object): Promise<Blob> {
  if (format === 'md') return new Blob([buildMarkdownExport(content)], { type: 'text/markdown;charset=utf-8;' });
  const res = await fetch(`/api/export/${format}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Zetora AI', content, meta }),
  });
  if (!res.ok) throw new Error((await res.text()) || `Failed to generate ${FORMATS[format].name}`);
  return res.blob();
}

async function exportMessage(message: ChatMessage, modelLabel: string | null, format: ExportFormat) {
  const { name, icon: Icon, extension } = FORMATS[format];
  const content = message.parts
    .flatMap((p) => (p.type === 'text' && p.text.trim() ? [p.text.trim()] : []))
    .join('\n\n');
  if (!content) {
    sileo.error({
      title: 'Nothing to export',
      description: 'No content found in this message',
      icon: <AlertCircle className="h-4 w-4" />,
    });
    return;
  }
  try {
    const blob = await renderExport(format, content, {
      modelLabel,
      createdAt: message.metadata?.createdAt ?? Date.now(),
    });
    downloadBlob(blob, `zetora-export-${message.id || Date.now()}.${extension}`);
    sileo.success({
      title: `${name} downloaded`,
      description: `Your ${FORMATS[format].label} file is ready`,
      icon: <Icon className="h-4 w-4" />,
    });
  } catch (error) {
    console.error(`Export ${name} error:`, error);
    sileo.error({
      title: `Failed to export ${name}`,
      description: 'Please try again',
      icon: <X className="h-4 w-4" />,
    });
  }
}

// Downloads the answer as PDF, Word or Markdown.
export function ExportMenu({ message, modelLabel }: { message: ChatMessage; modelLabel: string | null }) {
  return (
    <DropdownMenu>
      <ActionTooltip label="Export">
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={actionIconButtonClassName}>
            <IconArrowInbox className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
      </ActionTooltip>
      <DropdownMenuContent className="min-w-[140px]" align="start" sideOffset={4}>
        {(Object.keys(FORMATS) as ExportFormat[]).map((format) => {
          const { label, icon: Icon } = FORMATS[format];
          return (
            <DropdownMenuItem
              key={format}
              className="cursor-pointer gap-2"
              onClick={() => exportMessage(message, modelLabel, format)}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
