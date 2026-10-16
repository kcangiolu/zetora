'use client';

import { useEffect, useState } from 'react';
import { Check, Clock, X, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHermesSend } from '@/hooks/use-hermes-send';
import type { HermesPromptData } from '@/lib/types';

type HermesPromptOption = HermesPromptData['options'][number];

const STYLE_CLASSES: Record<string, string> = {
  primary: 'bg-foreground text-background hover:opacity-90',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  secondary: 'border border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60',
};

// Renders a Hermes `prompt` action (exec approval / clarify / choice) as native buttons —
// modeled directly on McpApprovalCard (components/message-parts/mcp.tsx). Clicking an
// option round-trips through /api/hermes/send with the EXACT wire shape
// gateway/relay/adapter.py's `_consume_prompt_response` expects: text mirroring
// `/{option_id}` plus a structured `prompt_response: {prompt_id, option_id, label}` —
// verified against that source, not guessed from the prose doc.
export function HermesPromptCard({ chatId, prompt }: { chatId: string; prompt: HermesPromptData }) {
  const [answeredOptionId, setAnsweredOptionId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // A missing expiresAt means "unknown", never expired. The deadline is our own estimate
  // (see agent-event/route.ts), not one Hermes sends, so clicking stays possible either
  // way: Hermes's slash-command text fallback still works.
  const [isExpired, setIsExpired] = useState(() => prompt.expiresAt != null && Date.now() >= prompt.expiresAt);
  const sendHermesMessage = useHermesSend(chatId);

  useEffect(() => {
    if (isExpired || answeredOptionId || prompt.expiresAt == null) return;
    // Already-past deadlines still go through setTimeout (0ms clamp) rather than an
    // immediate setState here — the lazy useState initializer above already covers the
    // "expired before first render" case, so this only ever fires for a still-pending one.
    const timer = setTimeout(() => setIsExpired(true), Math.max(0, prompt.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [prompt.expiresAt, isExpired, answeredOptionId]);

  const handleClick = async (option: HermesPromptOption) => {
    if (answeredOptionId || sending || isExpired) return;
    setSending(true);
    try {
      await sendHermesMessage(`/${option.id}`, {
        promptResponse: { promptId: prompt.promptId, optionId: option.id, label: option.label },
      });
      setAnsweredOptionId(option.id);
    } catch {
      // Left un-answered so the user can retry — a failed send here means Hermes never
      // saw the press, unlike a McpApprovalCard failure which the LLM turn already owns.
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 px-3.5 py-3 space-y-3">
      <div className="flex items-start gap-2">
        <HelpCircle className="size-3.5 mt-0.5 shrink-0 text-muted-foreground/70" />
        <p className="text-[13px] whitespace-pre-wrap">{prompt.content}</p>
      </div>

      {answeredOptionId ? (
        <div className="rounded-lg px-3 py-2 text-[11px] font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
          ✓ {prompt.options.find((o) => o.id === answeredOptionId)?.label ?? answeredOptionId}
        </div>
      ) : isExpired ? (
        <div className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium bg-muted/40 border border-border/50 text-muted-foreground">
          <Clock className="size-3.5 shrink-0" />
          Expired — reply as a normal message instead
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {prompt.options.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={sending}
              onClick={() => handleClick(option)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg text-[12px] font-medium px-3 py-2 transition-opacity disabled:opacity-50',
                STYLE_CLASSES[option.style ?? 'secondary'],
              )}
            >
              {option.style === 'danger' ? <X className="size-3.5" /> : <Check className="size-3.5" />}
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
