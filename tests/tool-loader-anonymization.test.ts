import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';

// With anonymization on, every tool that can reach an outside service (MCP
// servers included) gets pseudonymized input, whatever the chat model.

const getUserAnonymizeContext = vi.hoisted(() => vi.fn());
const getAnonymizeContext = vi.hoisted(() => vi.fn());

vi.mock('@/lib/egress/anonymization', () => ({ getUserAnonymizeContext }));
vi.mock('@/ai/providers', () => ({ getAnonymizeContext }));
vi.mock('@/lib/instance/capabilities', () => ({ isToolAvailable: () => true }));
vi.mock('@/lib/anonymizer/pseudonymize', () => ({
  anonymizeToolInput: async (value: unknown) => JSON.parse(JSON.stringify(value).replaceAll('Jane Doe', '⟦PERSON⟧')),
  deanonymizeToolOutput: async (value: unknown) => JSON.parse(JSON.stringify(value).replaceAll('⟦PERSON⟧', 'Jane Doe')),
}));

import { loadConfiguredTools } from '@/lib/search/tool-loader';

const ctx = { userId: 'user-1' };

function echoTool() {
  const execute = vi.fn(async (input: { query: string }) => ({ echoed: input.query }));
  return { tool: tool({ description: 'echo', inputSchema: z.object({ query: z.string() }), execute }), execute };
}

async function load(mcpTool: ToolSet[string]) {
  return loadConfiguredTools({
    activeToolNames: ['datetime'],
    chatModelId: 'anthropic:claude-test',
    dataStream: undefined,
    timezone: undefined,
    contextFiles: [],
    includeMcpTools: true,
    mcpDynamicTools: { mcp_lookup: mcpTool },
    lightweightUser: { userId: 'user-1', email: '' },
    userPreferences: { 'zetora-anonymization-enabled': true },
  });
}

async function run(tools: ToolSet, name: string, input: unknown) {
  const execute = tools[name]?.execute;
  if (!execute) throw new Error(`${name} has no execute`);
  return execute(input, { toolCallId: 'call-1', messages: [] });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserAnonymizeContext.mockReturnValue(ctx);
});

describe('loadConfiguredTools with anonymization on', () => {
  it('pseudonymizes the input of an MCP tool for a cloud model, and leaves its output to the middleware', async () => {
    getAnonymizeContext.mockResolvedValue(ctx);
    const { tool, execute } = echoTool();
    const tools = await load(tool);

    const output = await run(tools, 'mcp_lookup', { query: 'Jane Doe' });

    expect(execute.mock.calls[0][0]).toEqual({ query: '⟦PERSON⟧' });
    expect(output).toEqual({ echoed: '⟦PERSON⟧' });
  });

  it('pseudonymizes the input for a local model too, and gives it the output back in cleartext', async () => {
    getAnonymizeContext.mockResolvedValue(null);
    const { tool, execute } = echoTool();
    const tools = await load(tool);

    const output = await run(tools, 'mcp_lookup', { query: 'Jane Doe' });

    expect(execute.mock.calls[0][0]).toEqual({ query: '⟦PERSON⟧' });
    expect(output).toEqual({ echoed: 'Jane Doe' });
  });

  it('leaves tools that stay inside the instance alone', async () => {
    getAnonymizeContext.mockResolvedValue(ctx);
    const { tool } = echoTool();
    const { datetimeTool } = await import('@/lib/tools/datetime');
    const tools = await load(tool);

    expect(tools.datetime).toBe(datetimeTool);
  });

  it('wraps nothing while anonymization is off', async () => {
    getUserAnonymizeContext.mockReturnValue(null);
    const { tool } = echoTool();
    const tools = await load(tool);

    expect(tools.mcp_lookup).toBe(tool);
  });
});
