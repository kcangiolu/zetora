import type { SearchResult } from '@/lib/tools/self-hosted-content';
import type { DataExtremeSearchPart } from '@/lib/types';

export type ExtremeSearchEvent = DataExtremeSearchPart['data'];

// What every research-agent tool shares with the run.
export interface AgentToolContext {
  // Streams a progress event to the deep-research card.
  emit: (event: ExtremeSearchEvent) => void;
  // Adds sources a tool read to the research result.
  collectSources: (...sources: SearchResult[]) => void;
}
