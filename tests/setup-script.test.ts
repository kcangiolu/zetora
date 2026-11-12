import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCatalog } from '@/ai/catalog/build';
import type { ModelsDevData, ModelsDevModel } from '@/ai/catalog/types';
import { TASK_ENV_KEYS } from '@/ai/models/tasks';

const REPO = resolve(__dirname, '..');

function parseEnv(content: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const line of content.split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) entries.set(match[1], match[2]);
  }
  return entries;
}

function fixtureModel(id: string, overrides: Partial<ModelsDevModel> = {}): ModelsDevModel {
  return {
    id,
    name: id,
    tool_call: true,
    release_date: new Date().toISOString().slice(0, 10),
    modalities: { input: ['text'], output: ['text'] },
    ...overrides,
  };
}

function source(...models: ModelsDevModel[]) {
  return { models: Object.fromEntries(models.map((model) => [model.id, model])) };
}

// What setup.sh lists must be what the app's catalog lists.
const MODELS_DEV: ModelsDevData = {
  anthropic: source(
    fixtureModel('claude-big'),
    fixtureModel('claude-small', { release_date: '2026-01-01' }),
    fixtureModel('claude-no-tools', { tool_call: false }),
    fixtureModel('claude-retired', { status: 'deprecated' }),
    fixtureModel('claude-ancient', { release_date: '2020-01-01' }),
  ),
  openrouter: source(
    fixtureModel('qwen/qwen-9-thinking', { name: 'Qwen 9 Thinking', reasoning: true }),
    fixtureModel('qwen/qwen-9-instruct', { name: 'Qwen 9 Instruct' }),
    fixtureModel('unknown-lab/model-1'),
  ),
};

describe('setup.sh', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zetora-setup-'));
    mkdirSync(join(dir, 'searxng'));
    mkdirSync(join(dir, 'ai/catalog'), { recursive: true });
    for (const file of ['setup.sh', '.env.example', 'searxng/settings.yml', 'ai/catalog/config.ts']) {
      copyFileSync(join(REPO, file), join(dir, file));
    }
    writeFileSync(join(dir, 'models-dev.json'), JSON.stringify(MODELS_DEV));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function run(answers: string[], modelsDevUrl = `file://${join(dir, 'models-dev.json')}`) {
    return spawnSync('bash', ['setup.sh', '--no-start'], {
      cwd: dir,
      input: answers.map((answer) => `${answer}\n`).join(''),
      encoding: 'utf8',
      env: { ...process.env, MODELS_DEV_URL: modelsDevUrl },
    });
  }

  // The `provider:model` ids setup.sh offered, in its order.
  function listedIds(stdout: string): string[] {
    return Array.from(stdout.matchAll(/^\s+\d+\) .+ \((\S+:\S+)\)$/gm), (match) => match[1]);
  }

  function writtenEnv(): Map<string, string> {
    return parseEnv(readFileSync(join(dir, '.env'), 'utf8'));
  }

  it('gives every model function a model', () => {
    const result = run(['1', 'test-key', 'acme:big', 'acme:small']);
    expect(result.status).toBe(0);
    const env = writtenEnv();
    const taskVars = Object.values(TASK_ENV_KEYS).filter((key): key is string => key !== null);
    for (const key of taskVars) {
      expect(['acme:big', 'acme:small'], key).toContain(env.get(key));
    }
    expect(env.get('ZETORA_MODEL_DEFAULT')).toBe('acme:big');
    expect(env.get('ZETORA_MODEL_CHAT_TITLE')).toBe('acme:small');
  });

  it('writes a .env the stack can start from', () => {
    expect(run(['1', 'test-key', 'acme:big', 'acme:small']).status).toBe(0);
    const env = writtenEnv();
    expect(env.get('ANTHROPIC_API_KEY')).toBe("'test-key'");
    for (const key of ['POSTGRES_PASSWORD', 'BETTER_AUTH_SECRET', 'MCP_CREDENTIALS_ENCRYPTION_KEY']) {
      expect(env.get(key), key).toMatch(/^[0-9a-f]{48,64}$/);
    }
    for (const key of ['NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_BASE_URL', 'ALLOWED_ORIGINS']) {
      expect(env.get(key), key).toBe('http://localhost:3333');
    }
    expect(env.get('COMPOSE_PROFILES')).toBe('searxng');
    expect(env.get('SEARXNG_URL')).toBe('http://searxng:8080');
    expect(env.get('REQUIRE_EMAIL_VERIFICATION')).toBe('false');
  });

  it('keeps an install without email checks on this machine', () => {
    expect(run(['1', 'test-key', 'acme:big', 'acme:small']).status).toBe(0);
    expect(writtenEnv().get('ZETORA_BIND')).toBe('127.0.0.1');
  });

  it('keeps .env private and SearXNG settings readable by its container', () => {
    expect(run(['1', 'test-key', 'acme:big', 'acme:small']).status).toBe(0);
    expect(statSync(join(dir, '.env')).mode & 0o777).toBe(0o600);
    const settingsPath = join(dir, 'data/searxng/settings.yml');
    expect(statSync(settingsPath).mode & 0o044).toBe(0o044);
    const settings = readFileSync(settingsPath, 'utf8');
    expect(settings).not.toContain('CHANGE_ME');
    expect(settings).toMatch(/secret_key: '[0-9a-f]{64}'/);
  });

  it('points a local endpoint at the host and names its models as custom ones', () => {
    const result = run(['8', 'http://localhost:11434/v1', '', 'qwen3:8b', 'not"valid', 'org/tiny']);
    expect(result.status).toBe(0);
    const env = writtenEnv();
    expect(JSON.parse((env.get('CUSTOM_AI_PROVIDERS') ?? '').slice(1, -1))).toEqual([
      { id: 'local', name: 'Local', baseURL: 'http://host.docker.internal:11434/v1', apiKey: 'local' },
    ]);
    expect(env.get('ZETORA_MODEL_DEFAULT')).toBe('custom-local-qwen3:8b');
    expect(env.get('ZETORA_MODEL_CHAT_TITLE')).toBe('custom-local-org/tiny');
  });

  it.each([
    ['4', 'DEEPSEEK_API_KEY'],
    ['5', 'ZAI_API_KEY'],
    ['6', 'MINIMAX_API_KEY'],
    ['7', 'OPENROUTER_API_KEY'],
  ])('stores the key of menu choice %s in %s', (choice, keyVar) => {
    expect(run([choice, 'test-key', 'acme:big', 'acme:small']).status).toBe(0);
    expect(writtenEnv().get(keyVar)).toBe("'test-key'");
  });

  it('asks again after an answer it cannot use', () => {
    const result = run(['0', '2', '', 'test-key', 'no-lab-prefix', 'acme:big', 'acme:small']);
    expect(result.status).toBe(0);
    const env = writtenEnv();
    expect(env.get('OPENAI_API_KEY')).toBe("'test-key'");
    expect(env.get('ZETORA_MODEL_DEFAULT')).toBe('acme:big');
  });

  it("offers the provider's models as the app's catalog lists them, picked by number", () => {
    const result = run(['1', 'test-key', '2', '1']);
    expect(result.status).toBe(0);
    const catalog = buildCatalog(MODELS_DEV, new Set(['anthropic'] as const)).map((entry) => entry.id);
    expect(listedIds(result.stdout)).toEqual(catalog);
    expect(catalog).toEqual(['anthropic:claude-big', 'anthropic:claude-small']);
    expect(writtenEnv().get('ZETORA_MODEL_DEFAULT')).toBe('anthropic:claude-small');
    expect(writtenEnv().get('ZETORA_MODEL_CHAT_TITLE')).toBe('anthropic:claude-big');
  });

  it("keeps an aggregator's list to the labs the app knows, with thinking/instant pairs as one model", () => {
    const result = run(['7', 'test-key', '1', '1']);
    expect(result.status).toBe(0);
    const catalog = buildCatalog(MODELS_DEV, new Set(['openrouter'] as const)).map((entry) => entry.id);
    expect(listedIds(result.stdout)).toEqual(catalog);
    expect(catalog).toEqual(['openrouter:qwen/qwen-9']);
  });

  it('still takes typed ids when models.dev cannot be reached', () => {
    const result = run(['1', 'test-key', '1', 'acme:big', 'acme:small'], `file://${join(dir, 'missing.json')}`);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Could not reach');
    expect(writtenEnv().get('ZETORA_MODEL_DEFAULT')).toBe('acme:big');
  });

  it('never overwrites an existing .env', () => {
    writeFileSync(join(dir, '.env'), 'POSTGRES_PASSWORD=keep-me\n');
    const result = run(['1', 'test-key', 'acme:big', 'acme:small']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('.env already exists');
    expect(readFileSync(join(dir, '.env'), 'utf8')).toBe('POSTGRES_PASSWORD=keep-me\n');
  });

  it('writes nothing when the answers stop halfway', () => {
    const result = run(['1', 'test-key']);
    expect(result.status).toBe(1);
    expect(existsSync(join(dir, '.env'))).toBe(false);
    expect(existsSync(join(dir, 'data'))).toBe(false);
  });
});
