// Turns the frames of a Hermes chat (lib/hermes/realtime.ts) into the text the voice page
// speaks. A reply segment streams as `draft` frames, each carrying the whole text so far,
// then lands as a `message` holding the same text. The turn's end carries its final reply
// too, and can arrive before or after that reply's message. Only what has not been spoken
// yet is returned, so nothing is said twice.
export class HermesSpeechTracker {
  private spoken = '';
  private draftId: number | null = null;
  private lastMessage = '';

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
    this.lastMessage = text;
    return rest;
  }

  // The text to speak when the turn ends with `response` as its final reply.
  turnEnd(response: string): string {
    if (!this.spoken && response.trim() === this.lastMessage.trim()) return '';
    return this.message(response);
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
