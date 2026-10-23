import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Loader2, Pencil, Square, Trash2, Volume2 } from 'lucide-react';
import { SplitIcon } from '@hugeicons/core-free-icons';
import { sileo } from 'sileo';

import { branchOutChat } from '@/app/actions';
import { ShareButton } from '@/components/share';
import { Button } from '@/components/ui/button';
import { HugeiconsIcon } from '@/components/ui/hugeicons';
import { useMessageActions } from '@/contexts/message-actions-context';
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard';
import { useSpeech } from '@/hooks/use-speech';
import { extractSpeakableText } from '@/lib/speakable-text';
import type { ChatMessage } from '@/lib/types';
import type { ComprehensiveUserData } from '@/lib/user-data-server';
import { cn } from '@/lib/utils';

import { ActionTooltip, actionIconButtonClassName } from './action-button';
import { ExportMenu } from './export-menu';
import { CopyIcon, TryAgainIcon } from './shared';

// Runs an async action once at a time, exposing whether it is running.
function useBusyAction(action: () => Promise<void>) {
  const [isBusy, setIsBusy] = useState(false);
  const run = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await action();
    } finally {
      setIsBusy(false);
    }
  };
  return [isBusy, run] as const;
}

// The buttons under an answer: edit, try again, delete, share, copy, read aloud, branch
// out and export.
export function ResponseActions({
  message,
  text,
  modelLabel,
  canEdit,
  isLastAssistantMessage,
  onEdit,
  user,
  isOwner,
  chatId,
  selectedVisibilityType,
}: {
  message: ChatMessage;
  // The answer's text, cleaned of model tokens.
  text: string;
  modelLabel: string | null;
  canEdit: boolean;
  isLastAssistantMessage: boolean;
  onEdit: () => void;
  user?: ComprehensiveUserData;
  isOwner?: boolean;
  chatId?: string;
  selectedVisibilityType?: 'public' | 'private';
}) {
  const { onRetryLastTurn, onDeleteLastTurn, onVisibilityChange } = useMessageActions();
  const { copy } = useCopyToClipboard();
  const speech = useSpeech();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isReadingThis = speech.speakingId === message.id;
  const isSpeaking = isReadingThis && speech.isSpeaking;
  const isConnecting = isReadingThis && speech.isLoading;

  const [isRegenerating, retry] = useBusyAction(onRetryLastTurn);
  const [isDeleting, deleteTurn] = useBusyAction(onDeleteLastTurn);
  const [isBranchingOut, branchOut] = useBusyAction(async () => {
    try {
      if (!chatId) {
        sileo.error({ title: 'Failed to branch out chat' });
        return;
      }
      const result = await branchOutChat({ chatId, messageId: message.id });
      if (!result.success || !result.chatId) {
        sileo.error({ title: result.error || 'Failed to branch out chat' });
        return;
      }
      if (user?.id) queryClient.refetchQueries({ queryKey: ['recent-chats', user.id] });
      sileo.success({ title: 'Chat branched out successfully' });
      router.push(`/search/${result.chatId}`);
    } catch (error) {
      console.error('Error branching out chat:', error);
      sileo.error({ title: 'Failed to branch out chat' });
    }
  });

  return (
    <div className="flex items-center gap-1.5">
      {/* Edits this answer's text in place, without regenerating. */}
      {canEdit && (
        <ActionTooltip label="Edit response">
          <Button variant="ghost" size="icon" onClick={onEdit} className={actionIconButtonClassName}>
            <Pencil className="h-4 w-4" />
          </Button>
        </ActionTooltip>
      )}

      {canEdit && isLastAssistantMessage && (
        <ActionTooltip label="Try Again">
          <Button
            variant="ghost"
            size="icon"
            disabled={isRegenerating}
            onClick={retry}
            className={actionIconButtonClassName}
          >
            <TryAgainIcon className="h-4 w-4" />
          </Button>
        </ActionTooltip>
      )}

      {/* Removes this answer and the question that prompted it. */}
      {canEdit && isLastAssistantMessage && (
        <ActionTooltip label="Delete question & response">
          <Button
            variant="ghost"
            size="icon"
            disabled={isDeleting}
            onClick={deleteTurn}
            className={actionIconButtonClassName}
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </ActionTooltip>
      )}

      {onVisibilityChange && (
        <ShareButton
          chatId={chatId || null}
          selectedVisibilityType={selectedVisibilityType || 'private'}
          onVisibilityChange={async (visibility) => {
            await Promise.resolve(onVisibilityChange(visibility));
          }}
          isOwner={isOwner}
          user={user}
          variant="icon"
          size="sm"
          className={actionIconButtonClassName}
        />
      )}

      <ActionTooltip label="Copy">
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            copy(text, {
              title: 'Copied to clipboard',
              description: 'You can now paste it anywhere',
              icon: <Copy className="h-4 w-4" />,
            })
          }
          className={actionIconButtonClassName}
        >
          <CopyIcon className="h-[18px] w-[18px]" />
        </Button>
      </ActionTooltip>

      {/* /api/tts/stream needs a session (lib/voice-session-token.ts). */}
      {user && (
        <ActionTooltip label={isConnecting ? 'Connecting…' : isSpeaking ? 'Stop' : 'Read Aloud'}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (isSpeaking || isConnecting) {
                speech.stop();
                return;
              }
              const speakable = extractSpeakableText(text);
              if (speakable) speech.speak(speakable, message.id);
            }}
            className={cn(
              actionIconButtonClassName,
              (isSpeaking || isConnecting) && 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/15',
            )}
          >
            {isConnecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isSpeaking ? (
              <Square className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
        </ActionTooltip>
      )}

      {canEdit && message.role === 'assistant' && (
        <ActionTooltip label="Branch Out">
          <Button
            variant="ghost"
            size="icon"
            disabled={isBranchingOut}
            onClick={branchOut}
            className={actionIconButtonClassName}
          >
            {isBranchingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <HugeiconsIcon icon={SplitIcon} size={16} color="currentColor" className="rotate-90" />
            )}
          </Button>
        </ActionTooltip>
      )}

      {message.role === 'assistant' && <ExportMenu message={message} modelLabel={modelLabel} />}
    </div>
  );
}
