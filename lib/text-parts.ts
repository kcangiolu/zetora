// The text of a message's parts: its `text` parts, in order. Reads both the parts of a saved
// message and those of a Hermes `message` frame.
export function textOfParts(parts: Array<Record<string, unknown>>): string {
  return parts.flatMap((part) => (part.type === 'text' && typeof part.text === 'string' ? [part.text] : [])).join('\n');
}
