// Settings models.dev doesn't carry: sampling parameters labs recommend for
// their models. Per lab, never per model, so new releases inherit them.
import type { ModelParameters } from '@/ai/models/types';

interface SamplingRecommendation {
  instant: ModelParameters;
  // While thinking, when it differs.
  thinking?: ModelParameters;
}

const SAMPLING_BY_LAB: Record<string, SamplingRecommendation> = {
  alibaba: {
    instant: { temperature: 0.7, topP: 0.8, topK: 20, minP: 0 },
    thinking: { temperature: 0.6, topP: 0.95, topK: 20, minP: 0 },
  },
  zhipu: { instant: { temperature: 1, topP: 0.95 } },
  minimax: { instant: { temperature: 1, topP: 0.95, topK: 40 } },
  moonshot: { instant: { temperature: 0.6 }, thinking: { temperature: 1 } },
  arcee: { instant: { temperature: 0.15, topK: 50, topP: 0.75, minP: 0.06 } },
  sarvam: { instant: { temperature: 0.5 } },
};

export function getSamplingParameters(lab: string, thinking: boolean): ModelParameters {
  const recommendation = SAMPLING_BY_LAB[lab];
  if (!recommendation) return {};
  return (thinking && recommendation.thinking) || recommendation.instant;
}
