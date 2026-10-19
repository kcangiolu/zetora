// Token usage and timing saved with an answer.
export interface UsageMetadata {
  completionTime: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export const EMPTY_USAGE: UsageMetadata = {
  completionTime: null,
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
};

// From a total the provider reported. Without a total, input plus output.
export function usageFromTotal(usage: Usage | undefined, completionTime: number): UsageMetadata {
  const inputTokens = usage?.inputTokens ?? null;
  const outputTokens = usage?.outputTokens ?? null;
  const totalTokens =
    usage?.totalTokens ??
    (inputTokens !== null || outputTokens !== null ? (inputTokens ?? 0) + (outputTokens ?? 0) : null);
  return { completionTime, inputTokens, outputTokens, totalTokens };
}

// Summed over the steps an aborted answer completed. A count no step reported stays null.
export function usageFromSteps(steps: Array<{ usage?: Usage }>, completionTime: number): UsageMetadata {
  const sum = (key: keyof Usage) => {
    const values = steps.flatMap((step) => (typeof step.usage?.[key] === 'number' ? [step.usage[key]!] : []));
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) : null;
  };
  const inputTokens = sum('inputTokens');
  const outputTokens = sum('outputTokens');
  const totalTokens =
    sum('totalTokens') ??
    (inputTokens !== null || outputTokens !== null ? (inputTokens ?? 0) + (outputTokens ?? 0) : null);
  return { completionTime, inputTokens, outputTokens, totalTokens };
}
