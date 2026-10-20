import type { HermesToolStep, HermesToolStepStatus } from '@/lib/db/schema';

// What a browser receives for one Hermes tool call, live (the `tool_step` realtime event)
// and on page load alike.
export interface HermesToolStepView {
  toolCallId: string;
  toolName: string;
  preview: string | null;
  status: HermesToolStepStatus;
  durationMs: number | null;
  startedAt: string;
  triggerMessageId: string | null;
}

export function toHermesToolStepView(step: HermesToolStep): HermesToolStepView {
  return {
    toolCallId: step.toolCallId,
    toolName: step.toolName,
    preview: step.preview,
    status: step.status,
    durationMs: step.durationMs,
    startedAt: step.startedAt.toISOString(),
    triggerMessageId: step.triggerMessageId,
  };
}

// The events hermes-plugin/zetora sends, one per pre_tool_call and post_tool_call hook.
export type HermesToolEvent =
  | {
      phase: 'started';
      chatId: string;
      toolCallId: string;
      toolName: string;
      preview: string | null;
      triggerMessageId: string | null;
    }
  | {
      phase: 'finished';
      chatId: string;
      toolCallId: string;
      status: Exclude<HermesToolStepStatus, 'running'>;
      durationMs: number | null;
    };

const FINISHED_STATUSES: ReadonlySet<string> = new Set(['ok', 'error', 'blocked', 'cancelled']);
const MAX_ID_LENGTH = 200;
const MAX_TOOL_NAME_LENGTH = 100;
const MAX_PREVIEW_LENGTH = 300;

function boundedString(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

// Null for anything the plugin would not send: the gateway is authenticated, but its
// payload is still checked before it reaches the database.
export function parseHermesToolEvent(raw: unknown): HermesToolEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const event = raw as Record<string, unknown>;
  const chatId = boundedString(event.chatId, MAX_ID_LENGTH);
  const toolCallId = boundedString(event.toolCallId, MAX_ID_LENGTH);
  if (!chatId || !toolCallId) return null;

  if (event.phase === 'started') {
    const toolName = boundedString(event.toolName, MAX_TOOL_NAME_LENGTH);
    if (!toolName) return null;
    if (event.preview != null && boundedString(event.preview, MAX_PREVIEW_LENGTH) === null) return null;
    if (event.triggerMessageId != null && boundedString(event.triggerMessageId, MAX_ID_LENGTH) === null) return null;
    return {
      phase: 'started',
      chatId,
      toolCallId,
      toolName,
      preview: (event.preview as string | undefined) ?? null,
      triggerMessageId: (event.triggerMessageId as string | undefined) ?? null,
    };
  }

  if (event.phase === 'finished') {
    if (typeof event.status !== 'string' || !FINISHED_STATUSES.has(event.status)) return null;
    const { durationMs } = event;
    if (durationMs != null && !(Number.isInteger(durationMs) && (durationMs as number) >= 0)) return null;
    return {
      phase: 'finished',
      chatId,
      toolCallId,
      status: event.status as Exclude<HermesToolStepStatus, 'running'>,
      durationMs: (durationMs as number | undefined) ?? null,
    };
  }

  return null;
}
