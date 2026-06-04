export interface SandboxResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  durationMs: number;
  charts?: Array<{
    type: string;
    title: string;
    elements: unknown;
  }>;
}

export interface SandboxProvider {
  execute(code: string, timeoutMs?: number): Promise<SandboxResult>;
}
