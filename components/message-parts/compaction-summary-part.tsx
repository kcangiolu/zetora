import { useState } from 'react';
import { ChevronDown, ChevronUp, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { ChatMessage } from '@/lib/types';

import { TextPartEditor, useTextPartEdit } from './text-edit';

// The summary that replaces earlier messages once the context is compacted
// (lib/search/context-compaction.ts): collapsed by default, editable like an answer.
export function CompactionSummaryPart({
  text,
  message,
  partIndex,
  canEdit,
  isSignedIn,
}: {
  text: string;
  message: ChatMessage;
  partIndex: number;
  canEdit: boolean;
  isSignedIn: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const edit = useTextPartEdit({ message, partIndex, isSignedIn, failureTitle: 'Failed to save summary edit' });
  const replacedCount = message.metadata?.compactionReplacedCount ?? 0;

  return (
    <Card className="my-2 gap-0 border-dashed py-3">
      <CardHeader
        className="flex cursor-pointer flex-row items-center justify-between gap-2 px-4"
        onClick={() => setIsExpanded((v) => !v)}
      >
        <p className="text-xs font-medium text-muted-foreground">
          Summary of {replacedCount} earlier message{replacedCount === 1 ? '' : 's'}
        </p>
        <div className="flex items-center gap-1">
          {canEdit && !edit.isEditing && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              title="Edit summary"
              onClick={(e) => {
                e.stopPropagation();
                edit.start(text);
                setIsExpanded(true);
              }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      {(isExpanded || edit.isEditing) && (
        <CardContent className="px-4 pt-2">
          {edit.isEditing ? (
            <TextPartEditor
              edit={edit}
              original={text}
              textareaClassName="min-h-[120px] w-full resize-none border-none bg-transparent! p-0! text-sm text-foreground shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{text}</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
