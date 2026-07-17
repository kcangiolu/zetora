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
  /** Files saved via zetora_save_file() in the executed code, base64-encoded */
  files?: Array<{
    filename: string;
    content: string;
  }>;
}

export interface SandboxProvider {
  execute(code: string, timeoutMs?: number, installLibs?: string[]): Promise<SandboxResult>;
}
