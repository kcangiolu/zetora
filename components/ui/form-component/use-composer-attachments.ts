import { useCallback, useState } from 'react';
import { sileo } from 'sileo';

import { type Attachment, MAX_FILES } from './attachment-utils';
import { selectUploadableFiles, uploadFiles } from './upload-files';

// Adding files to the next message by picker, drop or paste, and removing them.
export function useComposerAttachments({
  attachments,
  setAttachments,
}: {
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
}) {
  // Names of the files still uploading, shown as placeholders.
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const attachFiles = useCallback(
    async (files: File[]) => {
      const uploadable = selectUploadableFiles(files, attachments.length);
      if (uploadable.length === 0) return;

      setUploadQueue(uploadable.map((file, i) => file.name || `Pasted Image ${i + 1}`));
      try {
        const uploaded = await uploadFiles(uploadable);
        if (uploaded.length > 0) setAttachments((current) => [...current, ...uploaded]);
      } finally {
        setUploadQueue([]);
      }
    },
    [attachments.length, setAttachments],
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      try {
        await attachFiles(Array.from(event.target.files || []));
      } finally {
        event.target.value = '';
      }
    },
    [attachFiles],
  );

  const removeAttachment = useCallback(
    async (index: number) => {
      const attachment = attachments[index];
      // Files this instance uploaded are deleted from storage too.
      if (attachment?.url.includes('/zetora/')) {
        try {
          await fetch('/api/upload', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: attachment.url }),
          });
        } catch (error) {
          console.error('Failed to delete file from storage:', error);
        }
      }
      setAttachments((prev) => prev.filter((_, i) => i !== index));
    },
    [attachments, setAttachments],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (attachments.length >= MAX_FILES) return;
      if (Array.from(e.dataTransfer.items ?? []).some((item) => item.kind === 'file')) setIsDragging(true);
    },
    [attachments.length],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) {
        sileo.error({ title: 'No files detected in drop' });
        return;
      }
      await attachFiles(files);
    },
    [attachFiles],
  );

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.items)
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (files.length === 0) return;
      e.preventDefault();
      await attachFiles(files);
    },
    [attachFiles],
  );

  return {
    uploadQueue,
    isDragging,
    handleFileChange,
    removeAttachment,
    dropHandlers: { onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop },
    handlePaste,
  };
}
