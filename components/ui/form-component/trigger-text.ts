export type TriggerChar = '@' | '/';

// The trigger the cursor is typing after: an '@' or '/' that starts the input or follows
// whitespace, with no whitespace between it and the cursor.
export function findActiveTrigger(
  value: string,
  cursor: number,
): { trigger: TriggerChar; position: number; filter: string } | null {
  for (let i = cursor - 1; i >= 0; i--) {
    const char = value[i];
    if (char === '@' || char === '/') {
      if (i > 0 && !/\s/.test(value[i - 1])) return null;
      return { trigger: char, position: i, filter: value.slice(i + 1, cursor) };
    }
    if (/\s/.test(char)) return null;
  }
  return null;
}

// Replaces the trigger the cursor is after, and what was typed after it, with `insertion`.
// Returns null when the cursor is not after that trigger.
export function replaceTriggerText(
  value: string,
  cursor: number,
  trigger: TriggerChar,
  insertion = '',
): { value: string; cursor: number } | null {
  for (let i = cursor - 1; i >= 0; i--) {
    if (value[i] === trigger) {
      const before = value.slice(0, i);
      const after = value.slice(cursor);
      if (insertion) return { value: before + insertion + after, cursor: i + insertion.length };
      const stripped = (before + after).trimStart();
      return { value: stripped, cursor: Math.min(i, stripped.length) };
    }
    if (value[i] === ' ' || value[i] === '\n') return null;
  }
  return null;
}
