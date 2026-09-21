import { cn } from '@/lib/utils';

// Marks a chat permanently locked to Agent mode (getHermesChatLock's own comment) in the
// sidebar and every chat-history surface — a small rainbow dot next to the title, mirroring
// how the public-chat Globe icon marks visibility.
export function HermesModeDot({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-block size-1.5 rounded-full shrink-0', className)}
      style={{
        background:
          'conic-gradient(from 180deg, #ef4444, #f97316, #eab308, #22c55e, #3b82f6, #a855f7, #ef4444)',
      }}
      aria-label="Agent mode conversation"
      title="Agent mode conversation"
    />
  );
}
