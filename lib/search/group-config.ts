import 'server-only';

import type { ComprehensiveUserData } from '@/lib/user-data-server';
import { getComprehensiveUserData } from '@/lib/user-data-server';
import type { SearchGroupId } from '@/lib/utils';

import * as autoGroup from './groups/auto';
import * as webGroup from './groups/web';
import * as academicGroup from './groups/academic';
import * as youtubeGroup from './groups/youtube';
import * as spotifyGroup from './groups/spotify';
import * as codeGroup from './groups/code';
import * as redditGroup from './groups/reddit';
import * as githubGroup from './groups/github';
import * as stocksGroup from './groups/stocks';
import * as cryptoGroup from './groups/crypto';
import * as chatGroup from './groups/chat';
import * as extremeGroup from './groups/extreme';
import * as xGroup from './groups/x';
import * as memoryGroup from './groups/memory';
import * as connectorsGroup from './groups/connectors';
import * as mcpGroup from './groups/mcp';
import * as multi_agentGroup from './groups/multi-agent';
import * as buddyGroup from './groups/buddy';
import * as predictionGroup from './groups/prediction';
import * as canvasGroup from './groups/canvas';

type LegacyGroupId = SearchGroupId | 'buddy';

// One module per group under lib/search/groups/, each exporting
// { tools, instructions }; shared prompt fragments live in groups/shared.ts.
const groups = {
  auto: autoGroup,
  web: webGroup,
  academic: academicGroup,
  youtube: youtubeGroup,
  spotify: spotifyGroup,
  code: codeGroup,
  reddit: redditGroup,
  github: githubGroup,
  stocks: stocksGroup,
  crypto: cryptoGroup,
  chat: chatGroup,
  extreme: extremeGroup,
  x: xGroup,
  memory: memoryGroup,
  connectors: connectorsGroup,
  mcp: mcpGroup,
  'multi-agent': multi_agentGroup,
  buddy: buddyGroup,
  prediction: predictionGroup,
  canvas: canvasGroup,
};

const groupTools = Object.fromEntries(Object.entries(groups).map(([id, group]) => [id, group.tools])) as {
  [K in keyof typeof groups]: (typeof groups)[K]['tools'];
};

const localGroupInstructions = Object.fromEntries(
  Object.entries(groups).map(([id, group]) => [id, group.instructions]),
) as Record<keyof typeof groups, string>;

export async function getGroupConfig(
  groupId: LegacyGroupId = 'web',
  lightweightUser?: { userId: string; email: string; isProUser: boolean } | null,
  fullUserPromise?: Promise<ComprehensiveUserData | null>,
) {
  if (
    groupId === 'memory' ||
    groupId === 'buddy' ||
    groupId === 'connectors' ||
    groupId === 'mcp' ||
    groupId === 'canvas' ||
    groupId === 'multi-agent'
  ) {
    if (!lightweightUser) {
      const user = fullUserPromise ? await fullUserPromise : await getComprehensiveUserData();
      if (!user) {
        groupId = 'web';
      } else if (
        (groupId === 'connectors' || groupId === 'mcp' || groupId === 'canvas' || groupId === 'multi-agent') &&
        !user.isProUser
      ) {
        groupId = 'web';
      }
    } else if (
      (groupId === 'connectors' || groupId === 'mcp' || groupId === 'canvas' || groupId === 'multi-agent') &&
      !lightweightUser.isProUser
    ) {
      groupId = 'web';
    }
  }

  return {
    tools: groupTools[groupId as keyof typeof groupTools],
    instructions: localGroupInstructions[groupId as keyof typeof localGroupInstructions],
  };
}
