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

describe('setup.sh', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'zetora-setup-'));
    mkdirSync(join(dir, 'searxng'));
    for (const file of ['setup.sh', '.env.example', 'searxng/settings.yml']) {
      copyFileSync(join(REPO, file), join(dir, file));
    }
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function run(answers: string[]) {
    return spawnSync('bash', ['setup.sh', '--no-start'], {
      cwd: dir,
      input: answers.map((answer) => `${answer}\n`).join(''),
      encoding: 'utf8',
    });
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

  it('points a local endpoint at the host and leaves the models to Settings', () => {
    const result = run(['5', 'http://localhost:11434/v1', '']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Settings > AI Models');
    const env = writtenEnv();
    expect(JSON.parse((env.get('CUSTOM_AI_PROVIDERS') ?? '').slice(1, -1))).toEqual([
      { id: 'local', name: 'Local', baseURL: 'http://host.docker.internal:11434/v1', apiKey: 'local' },
    ]);
    expect(env.get('ZETORA_MODEL_DEFAULT')).toBe('');
  });

  it('asks again after an answer it cannot use', () => {
    const result = run(['9', '2', '', 'test-key', 'no-lab-prefix', 'acme:big', 'acme:small']);
    expect(result.status).toBe(0);
    const env = writtenEnv();
    expect(env.get('OPENAI_API_KEY')).toBe("'test-key'");
    expect(env.get('ZETORA_MODEL_DEFAULT')).toBe('acme:big');
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
