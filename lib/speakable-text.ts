export function extractSpeakableText(markdown: string): string {
  let text = markdown;

  // 1. Remove fenced code blocks (```...```)
  text = text.replace(/```[\s\S]*?```/g, '');

  // 2. Remove markdown tables (lines starting with |, plus separator rows)
  text = text.replace(/^\|.*\|$/gm, '');
  text = text.replace(/^\|?[\s:|-]+\|[\s:|-]+\|?$/gm, '');

  // 3. Remove horizontal rules
  text = text.replace(/^[-*_]{3,}\s*$/gm, '');

  // 4. Remove inline code
  text = text.replace(/`([^`]+)`/g, '$1');

  // 5. Remove images
  text = text.replace(/!\[.*?\]\(.*?\)/g, '');

  // 6. Remove Sources/References sections (heading or bold) and everything after them
  text = text.replace(/\n#{1,6}\s*(sources?|références?|references?|liens?|bibliographie)[^\n]*[\s\S]*$/i, '');
  text = text.replace(/\n\*\*(sources?|références?|references?|liens?)[^*]*\*\*[\s\S]*$/i, '');

  // 7. Remove inline citations [Title](url) entirely — the label is an article
  // title that makes no sense spoken aloud. The text stays coherent without it.
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '');

  // 8. Remove orphan reference markers [1], [^1], [note]
  text = text.replace(/\[\^?\d+\]/g, '');

  // 9. Bold/italic → keep the text
  text = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  text = text.replace(/(\*|_)(.*?)\1/g, '$2');
  text = text.replace(/~~(.*?)~~/g, '$1');

  // 10. Headings → plain sentence (the title becomes a sentence)
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '$1.');

  // 11. Blockquotes → plain text
  text = text.replace(/^>\s?/gm, '');

  // 12. Lists → plain sentences
  // Numbered lists: "1. Item" → "Item."
  text = text.replace(/^\s*\d+\.\s+/gm, '');
  // Bullet lists: "- Item" → "Item."
  text = text.replace(/^[\s]*[-*+]\s+/gm, '');

  // 13. Special characters → natural (French) speech — the TTS voice is French
  text = text.replace(/→/g, ' donc ');
  text = text.replace(/~/g, 'environ ');
  text = text.replace(/×/g, ' par ');
  text = text.replace(/€/g, ' euros');
  text = text.replace(/%/g, ' pourcent');
  text = text.replace(/&/g, ' et ');
  text = text.replace(/\.{3}/g, '. ');
  text = text.replace(/«\s*/g, '');
  text = text.replace(/\s*»/g, '');

  // 14. Remove raw URLs
  text = text.replace(/https?:\/\/\S+/g, '');

  // 14b. Remove emoji — some TTS engines error or emit garbled audio when fed
  // these codepoints, and they don't map to anything sensible spoken aloud.
  text = text.replace(/\p{Extended_Pictographic}\uFE0F?/gu, '');
  text = text.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, ''); // regional-indicator flag letters
  text = text.replace(/\u200D/g, ''); // leftover zero-width joiners from multi-part emoji

  // 15. Remove any residual HTML
  text = text.replace(/<[^>]*>/g, '');

  // 16. Normalize line breaks
  text = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('. ');

  // 17. Avoid doubled punctuation and repeated spaces
  text = text.replace(/\.\s*\./g, '.');
  text = text.replace(/\s{2,}/g, ' ');
  text = text.replace(/\s+\./g, '.');
  text = text.replace(/\.+/g, '.');
  text = text.replace(/\s+,/g, ',');

  // 18. Strip remaining control characters
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return text.trim();
}
