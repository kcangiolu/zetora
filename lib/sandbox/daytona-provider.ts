import { Daytona } from '@daytonaio/sdk';
import { SNAPSHOT_NAME } from '@/lib/constants';
import type { SandboxProvider, SandboxResult } from './types';

export class DaytonaSandboxProvider implements SandboxProvider {
  constructor(private apiKey: string) {}

  async execute(code: string, _timeoutMs?: number): Promise<SandboxResult> {
    const daytona = new Daytona({ apiKey: this.apiKey, target: 'us' });
    const sandbox = await daytona.create({ snapshot: SNAPSHOT_NAME });

    try {
      const execution = await sandbox.process.codeRun(code);

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

      const chart = execution.artifacts?.charts?.[0];
      const charts = chart
        ? [{ type: chart.type, title: chart.title, elements: chart.elements }]
        : undefined;

      return {
        stdout: message.trim(),
        stderr: '',
        exitCode: 0,
        timedOut: false,
        durationMs: 0,
        charts,
      };
    } finally {
      await sandbox.delete();
    }
  }
}
