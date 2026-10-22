// Turns the frames of a Hermes chat (lib/hermes/realtime.ts) into the text the voice page
// speaks. A reply segment streams as `draft` frames, each carrying the whole text so far,
// then lands as a `message` holding the same text: only what has not been spoken yet is
// returned, so nothing is said twice.
export class HermesSpeechTracker {
  private spoken = '';
  private draftId: number | null = null;

  // The text to speak for a draft frame of segment `draftId`.
  draft(draftId: number, content: string): string {
    if (draftId !== this.draftId) {
      this.draftId = draftId;
      this.spoken = '';
    }
    return this.advance(content);
  }

  // The text to speak for the message that ends the current segment.
  message(text: string): string {
    const rest = this.spoken ? this.advance(text) : text;
    this.spoken = '';
    this.draftId = null;
    return rest;
  }

  // A text that rewrites what was already spoken (the final message reformatted, a draft
  // corrected) adds nothing: the listener has heard that part.
  private advance(text: string): string {
    const said = this.spoken.trimEnd();
    if (!text.startsWith(said)) return '';
    const rest = text.slice(said.length);
    this.spoken = text;
    return rest;
  }
}

// The text of a `message` frame's parts: its `text` parts, in order.
export function hermesMessageText(parts: Array<Record<string, unknown>>): string {
  return parts.flatMap((part) => (part.type === 'text' && typeof part.text === 'string' ? [part.text] : [])).join('\n');
}
