const START_WITH_PATTERN = /^\/startwith\s+"([^"]+)"\s*/;

// Strips a leading `/startwith "..."` command from the raw textarea input and
// returns the prefix it names, if any. Only matches at the very start of the
// input — a `/startwith` mid-message is left as literal text. Client-safe:
// no server-only imports here, unlike lib/chat-commands-server.ts, so
// form-component (a client component) can call this directly on submit.
export function parseStartWithCommand(input: string): { text: string; startWith?: string } {
  const match = input.match(START_WITH_PATTERN);
  if (!match) return { text: input };
  return { text: input.slice(match[0].length), startWith: match[1] };
}
