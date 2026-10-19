import type { PDFFont } from 'pdf-lib';

export function wrapText(text: string, widthFn: (s: string) => number, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split(/\n{2,}/);

  // Helper function to break a long word at character level
  const breakLongWord = (word: string): string[] => {
    const parts: string[] = [];
    let current = '';

    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      const tentative = current + char;

      if (widthFn(tentative) > maxWidth) {
        if (current) {
          parts.push(current);
          current = char;
        } else {
          // Even a single character is too wide, just add it
          parts.push(char);
          current = '';
        }
      } else {
        current = tentative;
      }
    }

    if (current) parts.push(current);
    return parts;
  };

  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let line = '';

    for (const word of words) {
      const tentative = line ? `${line} ${word}` : word;

      if (widthFn(tentative) > maxWidth) {
        if (line) {
          lines.push(line);
          line = '';
        }

        // Check if the word itself is too long
        if (widthFn(word) > maxWidth) {
          // Break the long word into smaller parts
          const wordParts = breakLongWord(word);
          for (let i = 0; i < wordParts.length; i++) {
            if (i === wordParts.length - 1) {
              // Last part becomes the new line
              line = wordParts[i];
            } else {
              // Add complete parts as separate lines
              lines.push(wordParts[i]);
            }
          }
        } else {
          line = word;
        }
      } else {
        line = tentative;
      }
    }

    if (line) lines.push(line);
    // Add an empty line between paragraphs
    lines.push('');
  }

  // Remove trailing empty line
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function measureTextWidth(font: PDFFont, text: string, size: number, fallbackMultiplier = 0.5) {
  try {
    return font.widthOfTextAtSize(text, size);
  } catch {
    return text.length * size * fallbackMultiplier;
  }
}

// Whether the font has a glyph for the character.
export function isSupportedByFont(ch: string, testFont: PDFFont): boolean {
  if (!testFont) return false;
  try {
    const width = testFont.widthOfTextAtSize(ch, 10);
    // Return false if width is 0 or negative (glyph not found in font)
    return width !== undefined && width > 0;
  } catch {
    return false;
  }
}

// The text without the characters the font cannot draw.
export function sanitizeForFont(text: string, testFont: PDFFont): string {
  if (!text) return '';
  return Array.from(text)
    .map((ch) => {
      if (ch === '\t') return '  ';
      if (ch === '\n') return ' ';
      // Keep character if supported by font
      if (isSupportedByFont(ch, testFont)) {
        return ch;
      }
      return '';
    })
    .join('');
}

// Width of a text in the font, skipping characters the font cannot draw.
export function textWidth(f: PDFFont, size: number) {
  return (s: string) => {
    if (!s) return 0;
    let totalWidth = 0;

    for (const char of Array.from(s)) {
      if (char === '\t') {
        try {
          totalWidth += f.widthOfTextAtSize('  ', size);
        } catch {
          totalWidth += size;
        }
        continue;
      }
      if (char === '\n') continue;

      let charWidth = 0;
      if (isSupportedByFont(char, f)) {
        try {
          charWidth = f.widthOfTextAtSize(char, size);
        } catch {
          charWidth = size * 0.5;
        }
      } else {
        // Character not supported, skip it (width = 0)
        charWidth = 0;
      }

      totalWidth += charWidth;
    }

    return totalWidth;
  };
}
