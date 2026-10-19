import { matricesToText, numberFootnotesAndCitations } from '@/lib/export/markdown';

// $$ blocks become \[ \] so the renderer meets one display-math syntax; matrices become
// text, footnotes and citations numbers.
export function preprocessMarkdown(md: string): string {
  if (!md) return '';
  md = md.replace(/\$\$([\s\S]*?)\$\$/g, (_m: string, block: string) => `\\[${block.trim()}\\]`);
  return numberFootnotesAndCitations(matricesToText(md));
}
