export type SuggestionTurn = { role: 'user' | 'assistant'; content: string };

// The exchange goes to the model as one user message. Sent as is, the history
// ends on the assistant's answer, which Anthropic reads as a prefill to continue
// and newer Claude models reject.
export function buildFollowUpRequest(history: SuggestionTurn[]): string {
  const transcript = history
    .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content.trim()}`)
    .join('\n\n');
  return `Here is the conversation:\n\n${transcript}\n\nWrite the follow-up questions for it.`;
}
