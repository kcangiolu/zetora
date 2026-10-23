'use client';

import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode, type RefObject } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { ConversationList } from '@/components/conversation-column';
import { Copy, EyeOff, RotateCcw } from 'lucide-react';
import { sileo } from 'sileo';
import { hideHermesMessageAction } from '@/app/actions/hermes';
import { useMessageActions } from '@/contexts/message-actions-context';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { useHermesSend } from '@/hooks/use-hermes-send';
import {
  buildHermesTurns,
  messageText,
  summarizeHermesSteps,
  type HermesTurn as HermesTurnData,
} from '@/lib/hermes/thread';
import type { HermesToolStepView } from '@/lib/hermes/tool-steps';
import type { Attachment, ChatMessage } from '@/lib/types';
import type { HermesBubbleAction } from './hermes-bubble';
import { HermesTurn, type RenderHermesPart } from './hermes-turn';

// Hermes's own /retry: it drops its last exchange and answers the user's last message again.
const RETRY_COMMAND = '/retry';

// An Agent conversation as turns of message bubbles and tool steps (lib/hermes/thread.ts).
// The list, scrolling and footer behave as the regular message list's do.
export function HermesThread<Context>({
  chatId,
  isOwner,
  messages,
  toolSteps,
  reactions,
  isAgentBusy,
  renderPart,
  attachmentsRenderer,
  virtuosoRef,
  onAtBottomChange,
  footer,
  footerContext,
}: {
  chatId: string;
  isOwner: boolean;
  messages: ChatMessage[];
  toolSteps: HermesToolStepView[];
  reactions?: Record<string, string | null>;
  // A typing heartbeat or a reply being written: the agent is still on the last turn.
  isAgentBusy: boolean;
  renderPart: RenderHermesPart;
  attachmentsRenderer?: (attachments: Attachment[]) => ReactNode;
  virtuosoRef: RefObject<VirtuosoHandle | null>;
  onAtBottomChange?: (atBottom: boolean) => void;
  footer: ComponentType<{ context: Context }>;
  footerContext: Context;
}) {
  const { setMessages } = useMessageActions();
  const { copy } = useCopyToClipboard();
  const sendHermesMessage = useHermesSend(chatId);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const turns = useMemo(() => buildHermesTurns(messages, toolSteps), [messages, toolSteps]);
  // Stable across renders: a new components object would remount the footer each time.
  const components = useMemo(() => ({ List: ConversationList, Footer: footer }), [footer]);
  const lastTurn = turns.at(-1);
  const isLastTurnLive = Boolean(lastTurn && (isAgentBusy || summarizeHermesSteps(lastTurn.steps).running));
  const lastAgentEntry = lastTurn?.entries.findLast((entry) => entry.kind === 'message');
  const retryableMessageId = !isLastTurnLive && lastAgentEntry?.kind === 'message' ? lastAgentEntry.message.id : null;

  // A click anywhere but on a bubble, or Escape, puts the selected one down.
  useEffect(() => {
    if (!selectedMessageId) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-hermes-bubble]')) {
        setSelectedMessageId(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedMessageId(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [selectedMessageId]);

  const hide = useCallback(
    async (message: ChatMessage) => {
      const result = await hideHermesMessageAction({ messageId: message.id });
      if (!result.success) {
        sileo.error({ title: 'Could not hide the message', description: result.error });
        return;
      }
      setMessages((current) => current.filter((m) => m.id !== message.id));
    },
    [setMessages],
  );

  const retry = useCallback(async () => {
    const messageId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id: messageId, role: 'user', parts: [{ type: 'text', text: RETRY_COMMAND }] } as ChatMessage,
    ]);
    try {
      await sendHermesMessage(RETRY_COMMAND, { messageId });
    } catch (error) {
      sileo.error({
        title: 'Failed to send to Hermes',
        description: error instanceof Error ? error.message : 'Please try again',
      });
    }
  }, [sendHermesMessage, setMessages]);

  const actionsFor = useCallback(
    (message: ChatMessage): HermesBubbleAction[] => {
      const copyAction: HermesBubbleAction = {
        id: 'copy',
        label: 'Copy',
        icon: Copy,
        onSelect: () => void copy(messageText(message)),
      };
      // Someone else viewing a public Agent chat can read it, not act on its owner's agent.
      if (!isOwner) return [copyAction];
      const actions = [copyAction];
      if (message.id === retryableMessageId) {
        actions.push({
          id: 'retry',
          label: 'Retry',
          description: `Answers your last message again (${RETRY_COMMAND})`,
          icon: RotateCcw,
          onSelect: () => void retry(),
        });
      }
      actions.push({
        id: 'hide',
        label: 'Hide',
        description: 'Hermes still remembers it',
        icon: EyeOff,
        onSelect: () => void hide(message),
        separated: true,
      });
      return actions;
    },
    [copy, hide, retry, retryableMessageId, isOwner],
  );

  // A reaction that arrived live (null when Hermes took it back) wins over the stored one.
  const reactionOf = useCallback(
    (message: ChatMessage) =>
      reactions && message.id in reactions ? reactions[message.id] : (message.metadata?.hermesReaction ?? null),
    [reactions],
  );

  const renderTurn = useCallback(
    (index: number, turn: HermesTurnData) => (
      <HermesTurn
        turn={turn}
        isLive={(index === turns.length - 1 && isLastTurnLive) || summarizeHermesSteps(turn.steps).running}
        reaction={turn.userMessage ? reactionOf(turn.userMessage) : null}
        selectedMessageId={selectedMessageId}
        onSelectMessage={setSelectedMessageId}
        actionsFor={actionsFor}
        renderPart={renderPart}
        attachmentsRenderer={attachmentsRenderer}
      />
    ),
    [turns.length, isLastTurnLive, reactionOf, selectedMessageId, actionsFor, renderPart, attachmentsRenderer],
  );

  return (
    <Virtuoso
      ref={virtuosoRef}
      style={{ height: '100%', overflowX: 'hidden' }}
      data={turns}
      computeItemKey={(_, turn) => turn.key}
      followOutput={false}
      atBottomStateChange={onAtBottomChange}
      atBottomThreshold={80}
      itemContent={renderTurn}
      context={footerContext}
      components={components}
    />
  );
}
