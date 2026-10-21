'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function NewChatHotkey() {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Fires even while typing in an input: the shortcut always needs a modifier.
      if (!e.shiftKey) return;

      const isNewChatShortcut =
        // Windows/Linux + sometimes mac (but mac browsers often reserve ⌘⇧O)
        ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) ||
        // mac-friendly fallback: ⌘⇧U (usually not reserved by browsers)
        (e.metaKey && (e.key === 'u' || e.key === 'U'));

      if (!isNewChatShortcut) return;

      e.preventDefault();
      router.push('/new');
    }

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [router]);

  return null;
}
