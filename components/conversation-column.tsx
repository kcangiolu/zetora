import type { ReactNode } from 'react';
import type { ListProps } from 'react-virtuoso';

// The conversation scroller spans the whole page width so its scrollbar sits at the page's
// right edge; the messages and the footer keep to the reading column inside it.
const CONVERSATION_COLUMN_CLASS = 'mx-auto w-full max-w-[95%] sm:max-w-2xl';

// Virtuoso's list element: it must take Virtuoso's ref and style, which carry its layout.
export function ConversationList({ ref, style, children }: ListProps) {
  return (
    <div ref={ref} style={style} className={CONVERSATION_COLUMN_CLASS}>
      {children}
    </div>
  );
}

export function ConversationColumn({ children }: { children: ReactNode }) {
  return <div className={CONVERSATION_COLUMN_CLASS}>{children}</div>;
}
