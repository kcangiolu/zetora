'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { sileo, type SileoOptions } from 'sileo';

// navigator.clipboard only exists in secure contexts: an instance served over
// plain HTTP (on a LAN, say) copies through a hidden textarea instead.
export async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  try {
    if (!document.execCommand('copy')) throw new Error('The browser rejected the copy command');
  } finally {
    document.body.removeChild(textArea);
  }
}

// What to show once the text is copied: a toast title, full toast options, or
// null when the button shows the copied state itself.
type CopiedToast = string | SileoOptions | null;

const COPIED_RESET_MS = 2000;

/**
 * Copies text and reports a failure in a toast. `copied` turns true after a
 * successful copy and back to false a moment later, for a check-mark icon.
 */
export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(resetTimerRef.current), []);

  const copy = useCallback(async (text: string, toast: CopiedToast = 'Copied to clipboard'): Promise<boolean> => {
    try {
      await writeClipboardText(text);
    } catch (error) {
      console.error('Copy failed:', error);
      sileo.error({ title: 'Failed to copy', description: 'Please copy it manually' });
      return false;
    }

    if (toast !== null) {
      sileo.success(typeof toast === 'string' ? { title: toast, icon: <Copy className="h-4 w-4" /> } : toast);
    }
    setCopied(true);
    clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return true;
  }, []);

  return { copied, copy };
}
