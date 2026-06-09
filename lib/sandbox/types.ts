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
    /** base64-encoded PNG without the data: URI prefix */
    png?: string;
  }>;
}

export interface SandboxProvider {
  execute(code: string, timeoutMs?: number, installLibs?: string[]): Promise<SandboxResult>;
}
