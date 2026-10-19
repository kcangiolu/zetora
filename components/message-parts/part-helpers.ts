import type { ReasoningUIPart } from 'ai';

import type { ChatMessage } from '@/lib/types';

type MessagePart = ChatMessage['parts'][number];

// Special tokens some local models leave in their text.
export function cleanModelText(text: string): string {
  return text
    .replace(/<\|begin_of_box\|>/g, '')
    .replace(/<\|end_of_box\|>/g, '')
    .replace(/<\|im_end\|>/g, '');
}

// Joins streamed reasoning chunks. Token-by-token providers already carry every space
// and newline; chunk-based ones (GPT, Gemini) don't end their chunks with a newline, so
// they get a paragraph break. No BPE token is longer than ~15 characters, so a chunk
// over 30 marks a chunk-based provider.
export function joinReasoningChunks(texts: string[]): string {
  const isChunkBased = texts.some((text) => text.length > 30);
  return texts.join(isChunkBased ? '\n\n' : '');
}

export function mergeReasoningStates(states: Array<ReasoningUIPart['state']>): ReasoningUIPart['state'] {
  if (states.includes('streaming')) return 'streaming';
  if (states.includes('done')) return 'done';
  return undefined;
}

// The parts an MCP timeline gathers into one stepper: from the reasoning, step and text
// parts leading into the first MCP tool call, through the last call, up to the final
// answer (the first long text after it). Null when the message called no MCP tool.
export function getMcpTimelineRange(
  parts: MessagePart[],
): { start: number; end: number; firstTool: number; lastTool: number } | null {
  const toolIndices = parts.flatMap((part, index) =>
    part.type === 'dynamic-tool' && part.toolName.startsWith('mcp_') ? [index] : [],
  );
  if (toolIndices.length === 0) return null;
  const firstTool = toolIndices[0];
  const lastTool = toolIndices[toolIndices.length - 1];

  let start = firstTool;
  for (let i = firstTool - 1; i >= 0; i--) {
    const type = parts[i]?.type;
    if (type !== 'reasoning' && type !== 'step-start' && type !== 'text') break;
    start = i;
  }

  const finalTextIndex = parts.findIndex(
    (part, index) => index > lastTool && part.type === 'text' && part.text.trim().length > 50,
  );
  const end = finalTextIndex === -1 ? parts.length - 1 : finalTextIndex - 1;
  return { start, end, firstTool, lastTool };
}
