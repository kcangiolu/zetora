import { NextRequest, NextResponse } from 'next/server';
import { assertInternalHermesAuth } from '@/lib/hermes/internal-auth';
import { assertHermesEnabled } from '@/lib/hermes/feature-flag';
import {
  getHermesConnectorByGatewayId,
  getHermesConversationByChatId,
  getUserPreferencesByUserId,
  listMemoryEntries,
  rememberMemoryEntry,
} from '@/lib/db/queries';
import {
  buildAgentMemoryPrompt,
  hermesMemoryRequestSchema,
  parseMemoryOpsOutput,
  type HermesMemoryRequest,
} from '@/lib/hermes/memory';
import { loadMemoryContext } from '@/lib/memory/context';
import { applyMemoryOps, buildStandaloneTurnPrompt, runDedicatedMemoryTurnUpdate } from '@/lib/memory/jobs';
import { cleanEntryText, cleanKeywords, type MemoryOrigin } from '@/lib/memory/ops';
import { formatTurnForMemory } from '@/lib/memory/prompt';
import { hasDedicatedMemoryModel, isAutoMemoryEnabled, isMemoryEnabled } from '@/lib/memory/settings';
import { selectRelevantEntries } from '@/lib/memory/text-match';
import type { UserPreferenceValues } from '@/lib/db/schema';
import { createLogger } from '@/lib/logger';

const log = createLogger('api-internal-hermes-memory');

const SEARCH_RESULTS_MAX = 10;

// Called by hermes-relay-service for each request of the memory provider in Zetora's
// Hermes plugin (hermes-relay-service/src/index.ts's handleMemory, which has already
// checked the gateway's bearer token). Hermes reads and grows the same memory as the
// gateway owner's Zetora chats.
export async function POST(req: NextRequest) {
  const disabled = assertHermesEnabled();
  if (disabled) return disabled;

  const authError = assertInternalHermesAuth(req);
  if (authError) return authError;

  let body: { gatewayId?: unknown; request?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = hermesMemoryRequestSchema.safeParse(body.request);
  if (typeof body.gatewayId !== 'string' || !parsed.success) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  try {
    const connector = await getHermesConnectorByGatewayId(body.gatewayId);
    if (!connector || connector.status !== 'enrolled') {
      return NextResponse.json({ error: 'unknown_gateway' }, { status: 404 });
    }
    const record = await getUserPreferencesByUserId({ userId: connector.userId });
    return NextResponse.json(await handle(parsed.data, connector.userId, connector.id, record?.preferences ?? null));
  } catch (error) {
    log.error('Hermes memory request failed:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

async function handle(
  request: HermesMemoryRequest,
  userId: string,
  connectorId: string,
  preferences: UserPreferenceValues | null,
) {
  if (!isMemoryEnabled(preferences)) {
    return { enabled: false };
  }

  switch (request.action) {
    case 'context':
      return { enabled: true, systemBlock: (await loadMemoryContext(userId, '')).systemBlock };

    case 'recall':
      return { enabled: true, contextualBlock: (await loadMemoryContext(userId, request.query)).contextualBlock };

    case 'turn': {
      const turnText = formatTurnForMemory(request.user, request.assistant);
      if (!isAutoMemoryEnabled(preferences) || !turnText) return { enabled: true, mode: 'off' };
      const origin = await resolveOrigin(request, connectorId);
      if (hasDedicatedMemoryModel(preferences)) {
        runDedicatedMemoryTurnUpdate({ userId, origin, preferences, turnText }).catch((error) =>
          log.error('Hermes memory turn update failed:', error instanceof Error ? error.message : error),
        );
        return { enabled: true, mode: 'zetora' };
      }
      return {
        enabled: true,
        mode: 'agent',
        prompt: buildAgentMemoryPrompt(await buildStandaloneTurnPrompt(userId, turnText)),
      };
    }

    case 'ops': {
      if (!isAutoMemoryEnabled(preferences)) return { enabled: true, applied: [] };
      const ops = parseMemoryOpsOutput(request.output);
      if (!ops) {
        log.warn('Hermes memory update: the model reply holds no valid operations');
        return { enabled: true, applied: [], error: 'invalid_output' };
      }
      const mutations = await applyMemoryOps(userId, await resolveOrigin(request, connectorId), ops);
      return { enabled: true, applied: mutations.map((m) => m.kind) };
    }

    case 'remember': {
      const text = cleanEntryText(request.memory);
      if (!text) return { enabled: true, success: false, error: 'The memory must be between 1 and 200 characters.' };
      const entry = await rememberMemoryEntry(
        userId,
        {
          text,
          category: request.category,
          durability: request.durability,
          tier: request.tier,
          keywords: cleanKeywords(request.keywords),
        },
        await resolveOrigin(request, connectorId),
      );
      return { enabled: true, success: true, memory: { id: entry.id, memory: entry.text } };
    }

    case 'search': {
      const entries = (await listMemoryEntries(userId)).filter((e) => e.status === 'confirmed' && !e.sensitive);
      const results = selectRelevantEntries(entries, request.query, SEARCH_RESULTS_MAX).map((e) => ({
        id: e.id,
        memory: e.text,
      }));
      return { enabled: true, results };
    }
  }
}

// A chat id the plugin reports only counts when it is one of this gateway's conversations.
async function resolveOrigin(
  request: { chatId: string | null; sessionId: string | null },
  connectorId: string,
): Promise<MemoryOrigin> {
  const conversation = request.chatId ? await getHermesConversationByChatId(request.chatId) : null;
  return {
    chatId: conversation?.connectorId === connectorId ? conversation.chatId : null,
    sessionId: request.sessionId,
  };
}
