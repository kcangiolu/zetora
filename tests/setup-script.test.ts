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

  // Fake nvidia-smi and docker for the GPU check, and a curl that answers each
  // key check with the next of keyStatuses (then 000) and records what it was
  // sent, ahead of the real tools; the real curl still reads models.dev.
  function fakeTools({
    driver = null as string | null,
    runtimes = 'io.containerd.runc.v2 nvidia runc',
    keyStatuses = [] as string[],
  } = {}) {
    const bin = join(dir, 'fake-bin');
    mkdirSync(bin, { recursive: true });
    const nvidiaSmi = driver === null ? 'exit 1' : `echo ${driver}`;
    writeFileSync(join(bin, 'nvidia-smi'), `#!/bin/sh\n${nvidiaSmi}\n`, { mode: 0o755 });
    writeFileSync(join(bin, 'docker'), `#!/bin/sh\necho ${runtimes}\n`, { mode: 0o755 });
    const realCurl = spawnSync('sh', ['-c', 'command -v curl'], { encoding: 'utf8' }).stdout.trim();
    const statuses = join(dir, 'key-statuses.txt');
    writeFileSync(statuses, keyStatuses.map((status) => `${status}\n`).join(''));
    writeFileSync(
      join(bin, 'curl'),
      [
        '#!/bin/sh',
        'for arg in "$@"; do',
        '  case "$arg" in',
        '    @-)',
        `      { echo "args: $*"; cat; } >>'${join(dir, 'key-checks.txt')}'`,
        `      status=$(head -n 1 '${statuses}'); tail -n +2 '${statuses}' >'${statuses}.next'`,
        `      mv '${statuses}.next' '${statuses}'; printf '%s' "\${status:-000}"; exit 0 ;;`,
        '  esac',
        'done',
        `exec '${realCurl}' "$@"`,
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    return bin;
  }

  function runSetup(
    answers: string[],
    { modelsDevUrl = `file://${join(dir, 'models-dev.json')}`, tools = fakeTools() } = {},
  ) {
    return spawnSync('bash', ['setup.sh', '--no-start'], {
      cwd: dir,
      input: answers.map((answer) => `${answer}\n`).join(''),
      encoding: 'utf8',
      env: { ...process.env, MODELS_DEV_URL: modelsDevUrl, PATH: `${tools}:${process.env.PATH}` },
    });
  }

  function run(answers: string[], modelsDevUrl?: string) {
    return runSetup(['1', ...answers], { modelsDevUrl });
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
    expect(writtenEnv().get('ZETORA_SERVICES_BIND')).toBe('127.0.0.1');
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

  describe('key check', () => {
    function readKeyChecks(): string {
      return readFileSync(join(dir, 'key-checks.txt'), 'utf8');
    }

    it("asks the provider about the key, given on curl's stdin", () => {
      const result = runSetup(['1', '1', 'test-key', 'acme:big', 'acme:small'], {
        tools: fakeTools({ keyStatuses: ['200'] }),
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Anthropic accepted the key.');
      const checks = readKeyChecks();
      expect(checks).toContain(
        'args: -s -o /dev/null -w %{http_code} --max-time 15 -H @- https://api.anthropic.com/v1/models',
      );
      expect(checks).toContain('x-api-key: test-key\nanthropic-version: 2023-06-01\n');
      expect(
        checks
          .split('\n')
          .filter((line) => line.startsWith('args:'))
          .join('\n'),
      ).not.toContain('test-key');
    });

    it.each([
      ['2', 'Authorization: Bearer test-key', 'https://api.openai.com/v1/models'],
      ['3', 'x-goog-api-key: test-key', 'https://generativelanguage.googleapis.com/v1beta/models'],
      ['4', 'Authorization: Bearer test-key', 'https://api.deepseek.com/models'],
      ['5', 'Authorization: Bearer test-key', 'https://api.z.ai/api/paas/v4/models'],
      ['6', 'Authorization: Bearer test-key', 'https://api.minimax.io/v1/models'],
      ['7', 'Authorization: Bearer test-key', 'https://openrouter.ai/api/v1/key'],
    ])('checks the key of menu choice %s with its own header and route', (choice, header, url) => {
      expect(
        runSetup(['1', choice, 'test-key', 'acme:big', 'acme:small'], { tools: fakeTools({ keyStatuses: ['200'] }) })
          .status,
      ).toBe(0);
      expect(readKeyChecks()).toContain(`${url}\n${header}\n`);
    });

    it('asks again for a key the provider refuses', () => {
      const result = runSetup(['1', '1', 'wrong-key', 'right-key', 'acme:big', 'acme:small'], {
        tools: fakeTools({ keyStatuses: ['401', '200'] }),
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Anthropic refused this key (HTTP 401). Check it, then type it again.');
      expect(writtenEnv().get('ANTHROPIC_API_KEY')).toBe("'right-key'");
    });

    it('takes a 400 as a refusal from Google only', () => {
      const google = runSetup(['1', '3', 'wrong-key', 'right-key', 'acme:big', 'acme:small'], {
        tools: fakeTools({ keyStatuses: ['400', '200'] }),
      });
      expect(writtenEnv().get('GOOGLE_AI_STUDIO_API_KEY')).toBe("'right-key'");
      expect(google.stdout).toContain('Google AI Studio refused this key (HTTP 400).');
      rmSync(join(dir, '.env'));
      const openai = runSetup(['1', '2', 'test-key', 'acme:big', 'acme:small'], {
        tools: fakeTools({ keyStatuses: ['400'] }),
      });
      expect(openai.stdout).toContain('Could not check the key with OpenAI');
    });

    it('keeps the key when the provider cannot be reached', () => {
      const result = run(['1', 'test-key', 'acme:big', 'acme:small']);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Could not check the key with Anthropic, so it is kept as typed.');
      expect(writtenEnv().get('ANTHROPIC_API_KEY')).toBe("'test-key'");
    });

    it('does not check a local endpoint before the stack runs', () => {
      expect(run(['8', 'http://localhost:11434/v1', '', 'qwen3:8b', 'qwen3:8b']).status).toBe(0);
      expect(existsSync(join(dir, 'key-checks.txt'))).toBe(false);
    });
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

  describe('full install', () => {
    // Every question of a full install, in order; a test replaces the answers
    // it is about.
    function fullAnswers({
      provider = ['1', 'test-key', 'acme:big', 'acme:small'],
      providers = ['2 15', 'xai-key', 'hf-key', 'xai:grok-test'],
      services = [''],
      sandbox = ['y'],
      voice = ['y', `'${join(dir, 'my sample.wav')}'`, 'French', 'Hello there'],
      hermes = ['y'],
      features = ['n', 'y'],
      tools = ['1 12', 'exa-key', 'amadeus-key', 'amadeus-secret'],
    } = {}) {
      return ['2', ...provider, ...providers, ...services, ...sandbox, ...voice, ...hermes, ...features, ...tools];
    }

    beforeEach(() => {
      writeFileSync(join(dir, 'my sample.wav'), 'RIFF');
    });

    function runFull(answers: string[], tools = fakeTools({ driver: '590.48.01' })) {
      return runSetup(answers, { tools });
    }

    it('runs every service picked, each with its own secret', () => {
      expect(runFull(fullAnswers()).status).toBe(0);
      const env = writtenEnv();
      expect(env.get('COMPOSE_PROFILES')).toBe('minio,searxng,fastcrw,bullmq,qdrant,presidio,sandbox,voice,tts,hermes');
      expect(env.get('MINIO_ROOT_PASSWORD')).toMatch(/^[0-9a-f]{48}$/);
      expect(env.get('S3_SECRET_ACCESS_KEY')).toBe(env.get('MINIO_ROOT_PASSWORD'));
      expect(env.get('S3_ENDPOINT')).toBe('http://minio:9000');
      expect(env.get('S3_PUBLIC_URL')).toBe('http://localhost:9010/zetora-uploads');
      expect(env.get('S3_PRESIGN_ENDPOINT')).toBe('http://localhost:9010');
      expect(env.get('BULLMQ_REDIS_PASSWORD')).toMatch(/^[0-9a-f]{48}$/);
      expect(env.get('BULLMQ_REDIS_PASSWORD')).not.toBe(env.get('MINIO_ROOT_PASSWORD'));
      expect(env.get('LOOKOUT_SCHEDULER')).toBe('bullmq');
      expect(env.get('SANDBOX_PROVIDER')).toBe('docker');
      expect(env.get('SEARXNG_URL')).toBe('http://searxng:8080');
      expect(env.get('FASTCRW_URL')).toBe('http://fastcrw:3000');
      expect(env.get('QDRANT_URL')).toBe('http://qdrant:6333');
      expect(env.get('ANONYMIZER_API_URL')).toBe('http://presidio-api:8000');
      expect(env.get('NEXT_PUBLIC_MCP_ENABLED')).toBe('false');
      expect(env.get('NEXT_PUBLIC_CANVAS_ENABLED')).toBe('true');
      expect(existsSync(join(dir, 'data/searxng/settings.yml'))).toBe(true);
    });

    it('stores the keys picked, and no other, without showing them', () => {
      const result = runFull(fullAnswers());
      expect(result.status).toBe(0);
      const env = writtenEnv();
      expect(env.get('XAI_API_KEY')).toBe("'xai-key'");
      expect(env.get('HF_TOKEN')).toBe("'hf-key'");
      expect(env.get('ZETORA_MODEL_X_SEARCH')).toBe('xai:grok-test');
      expect(env.get('EXA_API_KEY')).toBe("'exa-key'");
      expect(env.get('AMADEUS_API_KEY')).toBe("'amadeus-key'");
      expect(env.get('AMADEUS_API_SECRET')).toBe("'amadeus-secret'");
      expect(env.get('OPENAI_API_KEY')).toBe('');
      expect(env.get('TMDB_API_KEY')).toBe('');
      for (const key of ['test-key', 'xai-key', 'hf-key', 'exa-key', 'amadeus-secret']) {
        expect(result.stdout).not.toContain(key);
      }
    });

    it("leaves the main provider out of the other providers' list", () => {
      const list = runFull(fullAnswers()).stdout.split('More AI providers')[1].split('X search')[0];
      expect(list).not.toMatch(/^\s+\d+\) Anthropic$/m);
      expect(list).toMatch(/^\s+1\) OpenAI$/m);
    });

    it('sets up local voice with the recording to clone', () => {
      const result = runFull(fullAnswers());
      expect(result.status).toBe(0);
      const env = writtenEnv();
      expect(env.get('VOICE_S2S_URL')).toBe('ws://localhost:8100/v1/realtime');
      expect(JSON.parse((env.get('CUSTOM_AI_PROVIDERS') ?? '').slice(1, -1))).toEqual([
        {
          id: 'local-stt',
          name: 'Local speech-to-text',
          baseURL: 'http://stt-service:8080/v1',
          disableAutoDetect: true,
        },
        {
          id: 'local-tts',
          name: 'Local text-to-speech',
          baseURL: 'http://qwen3-tts:8080/v1',
          disableAutoDetect: true,
        },
      ]);
      const voices = join(dir, 'data/qwen3-tts/voices');
      expect(readFileSync(join(voices, 'my-voice.wav'), 'utf8')).toBe('RIFF');
      expect(readFileSync(join(voices, 'my-voice.lang'), 'utf8')).toBe('french\n');
      expect(readFileSync(join(voices, 'my-voice.txt'), 'utf8')).toBe('Hello there\n');
      expect(result.stdout).toContain('Its voice ID is my-voice');
    });

    it('keeps a local model endpoint beside the speech servers', () => {
      const provider = ['8', 'http://localhost:11434/v1', '', 'qwen3:8b', 'qwen3:8b'];
      const providers = ['none'];
      expect(runFull(fullAnswers({ provider, providers })).status).toBe(0);
      const providersJson = JSON.parse((writtenEnv().get('CUSTOM_AI_PROVIDERS') ?? '').slice(1, -1));
      expect(providersJson.map((entry: { id: string }) => entry.id)).toEqual(['local', 'local-stt', 'local-tts']);
    });

    it('asks again for a recording it cannot use, and can do without one', () => {
      const voice = ['y', join(dir, 'missing.wav'), join(dir, 'notes.txt'), ''];
      const result = runFull(fullAnswers({ voice }));
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('No file at');
      expect(result.stdout).toContain('Use a .wav, .mp3, .flac or .m4a file.');
      expect(existsSync(join(dir, 'data/qwen3-tts'))).toBe(false);
      expect(result.stdout).toContain('Text-to-speech needs a recording first');
    });

    it.each([
      [null, 'nvidia-smi did not give the driver version'],
      ['570.86.15', 'NVIDIA driver 570.86.15 found, the speech services need 580 or newer'],
    ])('does not offer local voice with driver %s', (driver, reason) => {
      const result = runFull(fullAnswers({ voice: [] }), fakeTools({ driver }));
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`Not offered: ${reason}.`);
      expect(writtenEnv().get('COMPOSE_PROFILES')).not.toContain('voice');
    });

    it('does not offer local voice without the nvidia runtime in Docker', () => {
      const result = runFull(
        fullAnswers({ voice: [] }),
        fakeTools({ driver: '590.48.01', runtimes: 'io.containerd.runc.v2 runc' }),
      );
      expect(result.stdout).toContain('Docker has no nvidia runtime');
    });

    it('turns Hermes on with its secrets and Web Push keys', () => {
      expect(runFull(fullAnswers()).status).toBe(0);
      const env = writtenEnv();
      expect(env.get('NEXT_PUBLIC_HERMES_ENABLED')).toBe('true');
      expect(env.get('HERMES_GATEWAY_SECRET_ENCRYPTION_KEY')).toMatch(/^[0-9a-f]{64}$/);
      expect(env.get('HERMES_RELAY_INTERNAL_SECRET')).toMatch(/^[0-9a-f]{64}$/);
      expect(env.get('HERMES_RELAY_PUBLIC_URL')).toBe('ws://localhost:8201');
      const publicKey = Buffer.from(env.get('VAPID_PUBLIC_KEY') ?? '', 'base64url');
      expect(publicKey).toHaveLength(65);
      expect(publicKey[0]).toBe(4);
      expect(Buffer.from(env.get('VAPID_PRIVATE_KEY') ?? '', 'base64url')).toHaveLength(32);
      expect(env.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY')).toBe(env.get('VAPID_PUBLIC_KEY'));
    });

    it('runs no optional service when none is picked, and says search is missing', () => {
      const result = runFull(
        fullAnswers({
          providers: ['none'],
          services: ['none'],
          sandbox: ['n'],
          voice: ['n'],
          hermes: ['n'],
          tools: ['none'],
        }),
      );
      expect(result.status).toBe(0);
      const env = writtenEnv();
      expect(env.has('COMPOSE_PROFILES')).toBe(false);
      expect(env.get('S3_ENDPOINT')).toBe('');
      expect(env.get('SANDBOX_PROVIDER')).toBe('');
      expect(env.get('NEXT_PUBLIC_HERMES_ENABLED')).toBe('false');
      expect(env.has('CUSTOM_AI_PROVIDERS') && env.get('CUSTOM_AI_PROVIDERS')).toBeFalsy();
      expect(existsSync(join(dir, 'data'))).toBe(false);
      expect(result.stdout).toContain('No search provider');
    });

    it('asks again after a pick out of range', () => {
      const result = runFull(fullAnswers({ services: ['7', '2 x', '2'] }));
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Pick numbers from 1 to 6.');
      expect(writtenEnv().get('COMPOSE_PROFILES')).toBe('searxng,sandbox,voice,tts,hermes');
    });
  });

  it('writes nothing when the answers stop halfway', () => {
    const result = run(['1', 'test-key']);
    expect(result.status).toBe(1);
    expect(existsSync(join(dir, '.env'))).toBe(false);
    expect(existsSync(join(dir, 'data'))).toBe(false);
  });
});
