import type { ChatMessage } from '@/lib/types';

// Places the compaction summary right after the last message it covers: its
// createdAt is the cutoff, the createdAt of the last folded message. Messages
// without a createdAt are still streaming in this session, so newer than any
// cutoff. An earlier copy of the summary is moved, since re-compaction
// advances the cutoff.
export function placeCompactionSummary(messages: ChatMessage[], summary: ChatMessage): ChatMessage[] {
  const cutoff = new Date(summary.metadata!.createdAt).getTime();
  const others = messages.filter((m) => m.id !== summary.id);

  let insertAt = 0;
  others.forEach((m, index) => {
    if (m.metadata?.createdAt && new Date(m.metadata.createdAt).getTime() <= cutoff) {
      insertAt = index + 1;
    }
  });

  return [...others.slice(0, insertAt), summary, ...others.slice(insertAt)];
}
