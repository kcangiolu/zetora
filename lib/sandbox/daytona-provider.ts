import { Daytona } from '@daytonaio/sdk';
import { SNAPSHOT_NAME } from '@/lib/constants';
import type { SandboxProvider, SandboxResult } from './types';
import { wrapCodeForFileCapture, parseFileMarker } from './file-capture';

import { createLogger } from '@/lib/logger';

const log = createLogger('daytona-provider');

export class DaytonaSandboxProvider implements SandboxProvider {
  constructor(private apiKey: string) {}

  async execute(code: string, _timeoutMs?: number, installLibs: string[] = []): Promise<SandboxResult> {
    const daytona = new Daytona({ apiKey: this.apiKey, target: 'us' });
    const sandbox = await daytona.create({ snapshot: SNAPSHOT_NAME });

    try {
      if (installLibs.length > 0) {
        log.debug('[DaytonaSandbox] Installing libs:', installLibs);
        await sandbox.process.executeCommand(`pip install ${installLibs.join(' ')}`, undefined, undefined, 60);
      }

      const execution = await sandbox.process.codeRun(wrapCodeForFileCapture(code));

      let message = '';

      if (execution.artifacts?.stdout === execution.result) {
        message += execution.result;
      } else if (execution.result && execution.result !== execution.artifacts?.stdout) {
        message += execution.result;
      } else if (execution.artifacts?.stdout && execution.artifacts?.stdout !== execution.result) {
        message += execution.artifacts.stdout;
      } else {
        message += execution.result;
      }

      const { stdout: cleanMessage, files } = parseFileMarker(message);
      message = cleanMessage;

      const rawCharts = execution.artifacts?.charts ?? [];
      const charts =
        rawCharts.length > 0
          ? rawCharts.map((chart: any) => {
              const rawPng: string | undefined = chart.png;
              const png = rawPng?.replace(/^data:image\/\w+;base64,/, '');
              return { type: chart.type ?? 'image', title: chart.title ?? 'Chart', elements: chart.elements, png };
            })
          : undefined;

      return {
        stdout: message.trim(),
        stderr: '',
        exitCode: 0,
        timedOut: false,
        durationMs: 0,
        charts,
        files,
      };
    } finally {
      await sandbox.delete();
    }
  }
}
