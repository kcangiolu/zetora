import { useCallback, useEffect, useRef } from 'react';

import { useOptimizedScroll } from '@/hooks/use-optimized-scroll';

import { isTimelineItemRunning, type TimelineItem } from './research-data';

// Ids of the inner lists (sources, posts, file passages, code output) that are still
// filling in, keyed as the timeline items register them.
function getFillingListIds(items: TimelineItem[]): Set<string> {
  const ids = new Set<string>();
  items.forEach((timelineItem, index) => {
    if (!isTimelineItemRunning(timelineItem, index === items.length - 1)) return;
    if (timelineItem.kind === 'code') {
      ids.add(`${timelineItem.item.id}-code`);
      ids.add(`${timelineItem.item.id}-result`);
    } else if (timelineItem.kind !== 'thinking' && timelineItem.kind !== 'browse_page_group') {
      ids.add(timelineItem.item.id);
    }
  });
  return ids;
}

// While the agent works, the timeline follows its newest step and each inner list that
// is still filling in follows its last row, until the reader scrolls away.
export function useTimelineAutoScroll(items: TimelineItem[], isRunning: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listsRef = useRef(new Map<string, HTMLElement>());
  const { scrollToBottom, markManualScroll, resetManualScroll } = useOptimizedScroll(bottomRef);

  useEffect(() => {
    if (isRunning) resetManualScroll();
  }, [isRunning, resetManualScroll]);

  // The content grows with new steps and with expanding ones alike.
  useEffect(() => {
    const content = contentRef.current;
    if (!isRunning || !content) return;
    const observer = new ResizeObserver(() => scrollToBottom());
    observer.observe(content);
    return () => observer.disconnect();
  }, [isRunning, scrollToBottom]);

  useEffect(() => {
    if (!isRunning) return;
    const fillingIds = getFillingListIds(items);
    const observers: ResizeObserver[] = [];
    for (const [id, list] of listsRef.current) {
      if (!fillingIds.has(id)) continue;
      list.scrollTop = list.scrollHeight;
      const observer = new ResizeObserver(() => {
        list.scrollTop = list.scrollHeight;
      });
      observer.observe(list);
      observers.push(observer);
    }
    return () => observers.forEach((observer) => observer.disconnect());
  }, [items, isRunning]);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (remaining < 24) resetManualScroll();
    else markManualScroll();
  }, [markManualScroll, resetManualScroll]);

  const registerList = useCallback(
    (id: string) => (node: HTMLElement | null) => {
      if (node) listsRef.current.set(id, node);
      else listsRef.current.delete(id);
    },
    [],
  );

  return { containerRef, contentRef, bottomRef, handleScroll, registerList };
}
