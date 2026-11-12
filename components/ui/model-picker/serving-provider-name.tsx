import { getServingProviderName, type Model } from '@/ai/models';
import { cn } from '@/lib/utils';

// The provider serving a model, shown next to its name when that is not the
// lab's own API: two "Qwen3.8 27B" are told apart by "Groq" and "OpenRouter".
export function ServingProviderName({ model, className }: { model: Model | undefined; className?: string }) {
  const name = model && getServingProviderName(model);
  if (!name) return null;
  return <span className={cn('text-muted-foreground shrink-0', className)}>{name}</span>;
}
