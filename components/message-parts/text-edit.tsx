import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { sileo } from 'sileo';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ChatMessage } from '@/lib/types';

import { usePersistMessageParts } from './use-persist-message-parts';

// Editing one text part of an answer in place: it overwrites the stored part and never
// regenerates or drops later messages.
export function useTextPartEdit({
  message,
  partIndex,
  isSignedIn,
  failureTitle,
}: {
  message: ChatMessage;
  partIndex: number;
  isSignedIn: boolean;
  failureTitle: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const persistMessageParts = usePersistMessageParts(message.id, isSignedIn);

  const save = async () => {
    try {
      setIsSaving(true);
      await persistMessageParts(
        message.parts.map((p, i) => (i === partIndex ? ({ ...p, text: draft } as ChatMessage['parts'][number]) : p)),
      );
      setIsEditing(false);
    } catch (error) {
      console.error(`${failureTitle}:`, error);
      sileo.error({ title: failureTitle });
    } finally {
      setIsSaving(false);
    }
  };

  return {
    isEditing,
    draft,
    setDraft,
    isSaving,
    start: (text: string) => {
      setDraft(text);
      setIsEditing(true);
    },
    cancel: () => setIsEditing(false),
    save,
  };
}

export function TextPartEditor({
  edit,
  original,
  textareaClassName,
}: {
  edit: ReturnType<typeof useTextPartEdit>;
  // The saved text: saving it unchanged is disabled.
  original: string;
  textareaClassName: string;
}) {
  return (
    <>
      <Textarea
        autoFocus
        value={edit.draft}
        onChange={(e) => edit.setDraft(e.target.value)}
        className={textareaClassName}
      />
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={edit.cancel}
          disabled={edit.isSaving}
          className="rounded-lg px-4"
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={edit.isSaving || !edit.draft.trim() || edit.draft.trim() === original.trim()}
          onClick={edit.save}
          className="rounded-lg px-5 bg-primary hover:bg-primary/90"
        >
          {edit.isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      </div>
    </>
  );
}
