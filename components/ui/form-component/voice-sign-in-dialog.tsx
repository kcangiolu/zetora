'use client';

import { CheckIcon } from 'lucide-react';
import { LockIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const FEATURES = [
  { title: 'Voice input', desc: 'Record & transcribe' },
  { title: 'Better models', desc: 'GPT-5, Claude 4.6' },
  { title: 'Search history', desc: 'Keep conversations' },
  { title: 'Free to start', desc: 'No payment required' },
];

// Voice input needs an account.
export function VoiceSignInDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] p-0 gap-0 overflow-hidden" showCloseButton={false}>
        <div className="relative px-6 pt-8 pb-6 text-center">
          <div className="absolute inset-0 bg-[url('/placeholder.png')] bg-cover bg-center">
            <div className="absolute inset-0 bg-linear-to-t from-background via-background/80 to-background/40" />
          </div>
          <div className="relative z-10 space-y-1.5">
            <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
              <LockIcon className="w-5 h-5 text-muted-foreground" />
            </div>
            <p className="text-lg font-semibold tracking-tight">Sign in required</p>
            <p className="font-pixel text-[10px] text-muted-foreground/50 uppercase tracking-wider">for Voice Input</p>
          </div>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <div className="rounded-xl border border-border/60 overflow-hidden grid grid-cols-2">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className={cn(
                  'flex items-start gap-2 p-2.5',
                  i % 2 === 0 && 'border-r border-border/40',
                  i < 2 && 'border-b border-border/40',
                )}
              >
                <CheckIcon className="size-3 text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium leading-tight">{f.title}</p>
                  <p className="font-pixel text-[8px] text-muted-foreground/50 uppercase tracking-wider mt-0.5">
                    {f.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <Button
            onClick={() => {
              window.location.href = '/sign-in';
            }}
            className="w-full rounded-lg h-9"
          >
            Sign in
          </Button>

          <button
            onClick={() => onOpenChange(false)}
            className="w-full text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors py-1"
          >
            Maybe later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
