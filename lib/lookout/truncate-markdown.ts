/**
 * Truncates markdown at a natural paragraph boundary to avoid broken links,
 * incomplete list items, or mid-sentence cuts.
 */
export function truncateMarkdown(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const softLimit = Math.min(text.length, maxLength + 400);

  function scanUntil(endIndex: number) {
    let isInInlineCode = false;
    let isInFence = false;
    let fenceTickCount = 0;

    let linkTextDepth = 0;
    let linkUrlDepth = 0;
    let shouldOpenUrlOnNextParen = false;
    let lastLinkStartIndex: number | null = null;

    let lastDoubleNewline = -1;
    let lastNewline = -1;
    let lastWhitespace = -1;
    let lastSentenceEnd = -1;

    for (let i = 0; i < endIndex; i++) {
      const char = text[i] ?? '';
      const nextTwo = text.slice(i, i + 3);

      if (nextTwo === '```') {
        isInFence = !isInFence;
        fenceTickCount = 0;
        i += 2;
        continue;
      }

      if (!isInFence) {
        if (char === '`') isInInlineCode = !isInInlineCode;

        if (!isInInlineCode) {
          if (char === '\n') {
            if (text[i - 1] === '\n') lastDoubleNewline = i + 1;
            lastNewline = i + 1;
          }

          if (/\s/.test(char)) lastWhitespace = i + 1;

          if ((char === '.' || char === '!' || char === '?') && /\s/.test(text[i + 1] ?? '')) lastSentenceEnd = i + 2;

          if (char === '[') {
            if (linkTextDepth === 0) lastLinkStartIndex = i;
            linkTextDepth += 1;
            shouldOpenUrlOnNextParen = false;
          } else if (char === ']') {
            if (linkTextDepth > 0) linkTextDepth -= 1;
            shouldOpenUrlOnNextParen = linkTextDepth === 0;
          } else if (char === '(') {
            if (shouldOpenUrlOnNextParen) {
              linkUrlDepth += 1;
              shouldOpenUrlOnNextParen = false;
            } else if (linkUrlDepth > 0) {
              // allow nested parens inside the URL
              linkUrlDepth += 1;
            }
          } else if (char === ')') {
            if (linkUrlDepth > 0) linkUrlDepth -= 1;
          } else if (char !== ' ' && char !== '\t') {
            // any non-space breaks the immediate `](` pattern
            shouldOpenUrlOnNextParen = false;
          }
        }
      } else {
        // within fences, don't treat markdown punctuation as structure
        if (char === '`') fenceTickCount += 1;
        else fenceTickCount = 0;
      }
    }

    return {
      isInInlineCode,
      isInFence,
      linkTextDepth,
      linkUrlDepth,
      lastLinkStartIndex,
      lastDoubleNewline,
      lastNewline,
      lastWhitespace,
      lastSentenceEnd,
    };
  }

  let cutIndex = maxLength;
  let stateAtCut = scanUntil(cutIndex);

  // If we are mid-markdown-link at the cut, extend forward a bit to close it cleanly.
  if (stateAtCut.linkTextDepth > 0 || stateAtCut.linkUrlDepth > 0) {
    for (let i = maxLength + 1; i <= softLimit; i++) {
      const nextState = scanUntil(i);
      if (nextState.linkTextDepth === 0 && nextState.linkUrlDepth === 0) {
        cutIndex = i;
        stateAtCut = nextState;
        break;
      }
    }

    // If we couldn't close the link within the soft limit, back up to before the link started.
    if (stateAtCut.linkTextDepth > 0 || stateAtCut.linkUrlDepth > 0) {
      const fallbackIndex = stateAtCut.lastLinkStartIndex ?? stateAtCut.lastNewline ?? stateAtCut.lastWhitespace;
      cutIndex = Math.max(0, Math.min(maxLength, fallbackIndex ?? maxLength));
      stateAtCut = scanUntil(cutIndex);
    }
  }

  // If we ended inside a list item line, try to finish the line (avoid half-rendered bullets).
  if (cutIndex < softLimit) {
    const nextNewlineIndex = text.indexOf('\n', cutIndex);
    if (nextNewlineIndex !== -1 && nextNewlineIndex <= softLimit) cutIndex = nextNewlineIndex;
  }

  // Prefer cutting at clean boundaries (in order).
  const boundaryState = scanUntil(cutIndex);
  const preferredBoundary =
    boundaryState.lastDoubleNewline > 0
      ? boundaryState.lastDoubleNewline
      : boundaryState.lastNewline > 0
        ? boundaryState.lastNewline
        : boundaryState.lastSentenceEnd > 0
          ? boundaryState.lastSentenceEnd
          : boundaryState.lastWhitespace > 0
            ? boundaryState.lastWhitespace
            : cutIndex;

  const safeIndex = Math.max(0, Math.min(cutIndex, preferredBoundary));
  const truncated = text.slice(0, safeIndex).trimEnd();
  return `${truncated}`;
}
