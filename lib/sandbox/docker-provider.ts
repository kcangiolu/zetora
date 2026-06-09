import type { SandboxProvider, SandboxResult } from './types';

const CHART_MARKER = '__CHART__:';

export class DockerSandboxProvider implements SandboxProvider {
  constructor(private baseUrl: string) {}

  async execute(code: string, timeoutMs = 30000): Promise<SandboxResult> {
    const wrappedCode = this.wrapCodeForCharts(code);

    const res = await fetch(`${this.baseUrl}/v1/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: wrappedCode,
        timeout_ms: timeoutMs,
        last_line_interactive: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      return {
        stdout: '',
        stderr: `Docker sandbox error (${res.status}): ${errText}`,
        exitCode: 1,
        timedOut: false,
        durationMs: 0,
      };
    }

    const data = await res.json();
    const { stdout, charts } = this.parseCharts(data.stdout || '');

    return {
      stdout,
      stderr: data.stderr || '',
      exitCode: data.exit_code ?? 0,
      timedOut: data.timed_out ?? false,
      durationMs: data.duration_ms ?? 0,
      charts: charts && charts.length > 0 ? charts : undefined,
    };
  }

  private wrapCodeForCharts(code: string): string {
    if (!code.includes('matplotlib') && !code.includes('plt.') && !code.includes('seaborn')) {
      return code;
    }
    return `
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import base64, io, json

${code}

# Capture all open figures as base64 charts
__charts = []
for __fig_num in plt.get_fignums():
    __fig = plt.figure(__fig_num)
    __buf = io.BytesIO()
    __fig.savefig(__buf, format='png', dpi=100, bbox_inches='tight')
    __buf.seek(0)
    __b64 = base64.b64encode(__buf.read()).decode()
    __charts.append(__b64)
    plt.close(__fig)

if __charts:
    print(f'${CHART_MARKER}' + json.dumps(__charts))
`.trim();
  }

  private parseCharts(stdout: string): { stdout: string; charts: SandboxResult['charts'] } {
    if (!stdout.includes(CHART_MARKER)) {
      return { stdout, charts: undefined };
    }

    const markerIdx = stdout.indexOf(CHART_MARKER);
    const cleanStdout = stdout.substring(0, markerIdx).trim();
    const chartsJson = stdout.substring(markerIdx + CHART_MARKER.length).trim();

    try {
      const b64List: string[] = JSON.parse(chartsJson);
      const charts = b64List.map((b64, i) => ({
        type: 'image' as const,
        title: `Chart ${i + 1}`,
        elements: [{ png: b64 }],
        png: b64,
      }));
      return { stdout: cleanStdout, charts };
    } catch {
      return { stdout: cleanStdout, charts: undefined };
    }
  }
}
