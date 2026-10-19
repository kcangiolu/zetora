// Markdown clean-up shared by the PDF and Word exports.

// Footnotes ([^label]) and pandoc citations ([@key]) as numbers in order of first use,
// with the footnote texts listed in a Notes section at the end.
export function numberFootnotesAndCitations(md: string): string {
  const footnoteDefs: Record<string, string> = {};
  md = md.replace(
    /^\[\^([^\]]+)\]:\s*([\s\S]*?)(?=\n{2,}|\n\[\^|\s*$)/gm,
    (_m: string, label: string, text: string) => {
      footnoteDefs[label] = text.trim();
      return '';
    },
  );

  const numberer = (order: string[]) => (_m: string, key: string) => {
    if (!order.includes(key)) order.push(key);
    return `[${order.indexOf(key) + 1}]`;
  };
  const footnoteOrder: string[] = [];
  md = md.replace(/\[\^([^\]]+)\]/g, numberer(footnoteOrder));
  md = md.replace(/\[@([^\]]+)\]/g, numberer([]));

  if (footnoteOrder.length === 0) return md;
  const notes = footnoteOrder.map((label, i) => `\n- [${i + 1}] ${footnoteDefs[label] || label}`).join('');
  return `${md}\n\n## Notes${notes}`;
}

// bmatrix and pmatrix environments as readable rows: [1, 2; 3, 4].
export function matricesToText(md: string): string {
  const flatten = (content: string) =>
    content
      .replace(/(?:\\\\|\\cr|\\0|\\n)/g, '; ')
      .replace(/&/g, ', ')
      .replace(/\s+/g, ' ')
      .trim();
  return md
    .replace(/\\begin\{bmatrix\}([\s\S]*?)\\end\{bmatrix\}/g, (_m: string, content: string) => `[${flatten(content)}]`)
    .replace(/\\begin\{pmatrix\}([\s\S]*?)\\end\{pmatrix\}/g, (_m: string, content: string) => `(${flatten(content)})`);
}
