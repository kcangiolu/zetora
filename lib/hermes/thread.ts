import type { ChatMessage } from '@/lib/types';
import type { HermesToolStepView } from './tool-steps';

// A note is what the agent said on its way to a tool call ("Remux to m4a and verify..."):
// Hermes sends that commentary as an ordinary message, so it is told apart by a step
// following it in the same turn.
type HermesTurnEntry =
  | { kind: 'message'; message: ChatMessage }
  | { kind: 'note'; message: ChatMessage }
  | { kind: 'step'; step: HermesToolStepView };

export interface HermesTurn {
  key: string;
  // Null for agent messages that came before any user message, such as a scheduled delivery.
  userMessage: ChatMessage | null;
  // The agent's messages and tool steps, in the order they happened.
  entries: HermesTurnEntry[];
  steps: HermesToolStepView[];
}

export interface HermesStepsSummary {
  count: number;
  failed: number;
  running: boolean;
  // From the first step's start to the last step's end; null while one is still running.
  durationMs: number | null;
}

// A message shown before the server confirmed it has no time yet: it is the newest one.
function messageTime(message: ChatMessage): number {
  const createdAt = message.metadata?.createdAt;
  return createdAt ? Date.parse(createdAt) : Number.POSITIVE_INFINITY;
}

function stepTime(step: HermesToolStepView): number {
  return Date.parse(step.startedAt);
}

// A step goes to the turn of the user message the plugin tied it to, else to the last
// turn opened before it started.
function turnIndexForStep(turns: HermesTurn[], step: HermesToolStepView): number {
  const byTrigger = turns.findIndex((turn) => turn.userMessage && turn.userMessage.id === step.triggerMessageId);
  if (byTrigger !== -1) return byTrigger;
  const started = stepTime(step);
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const opener = turns[index].userMessage;
    if (opener && messageTime(opener) <= started) return index;
  }
  return 0;
}

export function buildHermesTurns(messages: ChatMessage[], steps: HermesToolStepView[]): HermesTurn[] {
  const turns: HermesTurn[] = [];
  const agentMessages: ChatMessage[][] = [];
  for (const message of messages) {
    if (message.role === 'user') {
      turns.push({ key: message.id, userMessage: message, entries: [], steps: [] });
      agentMessages.push([]);
    } else if (message.role === 'assistant') {
      if (turns.length === 0) {
        turns.push({ key: `before-${message.id}`, userMessage: null, entries: [], steps: [] });
        agentMessages.push([]);
      }
      agentMessages[agentMessages.length - 1].push(message);
    }
  }
  if (turns.length === 0) return turns;

  for (const step of [...steps].sort((a, b) => stepTime(a) - stepTime(b))) {
    turns[turnIndexForStep(turns, step)].steps.push(step);
  }

  turns.forEach((turn, index) => {
    let nextStep = 0;
    for (const message of agentMessages[index]) {
      const sent = messageTime(message);
      while (nextStep < turn.steps.length && stepTime(turn.steps[nextStep]) < sent) {
        turn.entries.push({ kind: 'step', step: turn.steps[nextStep] });
        nextStep += 1;
      }
      turn.entries.push({ kind: 'message', message });
    }
    for (const step of turn.steps.slice(nextStep)) {
      turn.entries.push({ kind: 'step', step });
    }
    const lastStep = turn.entries.findLastIndex((entry) => entry.kind === 'step');
    turn.entries = turn.entries.map((entry, entryIndex) =>
      entry.kind === 'message' && entryIndex < lastStep && isTextOnly(entry.message)
        ? { kind: 'note', message: entry.message }
        : entry,
    );
  });
  return turns;
}

// A file or voice reply sent mid-task is a result, not commentary.
function isTextOnly(message: ChatMessage): boolean {
  return message.parts.every((part) => part.type === 'text');
}

export function summarizeHermesSteps(steps: HermesToolStepView[]): HermesStepsSummary {
  const running = steps.some((step) => step.status === 'running');
  const failed = steps.filter((step) => step.status === 'error').length;
  if (steps.length === 0 || running) {
    return { count: steps.length, failed, running, durationMs: null };
  }
  const start = Math.min(...steps.map(stepTime));
  const end = Math.max(...steps.map((step) => stepTime(step) + (step.durationMs ?? 0)));
  return { count: steps.length, failed, running, durationMs: end - start };
}

export function messageText(message: ChatMessage): string {
  return message.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();
}

// "0.4 s", "12 s", "1 min 5 s": one decimal only where it still says something.
export function formatStepDuration(ms: number): string {
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)} s`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 === 0 ? `${minutes} min` : `${minutes} min ${seconds % 60} s`;
}
