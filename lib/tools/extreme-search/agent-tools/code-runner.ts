import { PutObjectCommand } from '@aws-sdk/client-s3';
import { tool } from 'ai';
import { all } from 'better-all';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import { getBetterAllOptions } from '@/lib/better-all';
import { createLogger } from '@/lib/logger';
import { getSandboxProvider } from '@/lib/sandbox';
import { getStorageClient } from '@/lib/storage';

import type { AgentToolContext } from './context';

const log = createLogger('extreme-search');

export const PYTHON_LIBS_AVAILABLE = [
  'numpy',
  'pandas',
  'matplotlib',
  'scipy',
  'scikit-learn',
  'yfinance',
  'requests',
  'uv',
  'seaborn',
  'plotly',
  'sympy',
  'pydantic',
  'regex',
  'PyPDF2',
  'pdfplumber',
  'pymupdf',
  'tabula-py',
  'httpx',
  'aiohttp',
  'urllib3',
  'beautifulsoup4',
  'lxml',
  'scrapy',
  'selenium',
];

interface ChartArtifact {
  png?: string;
  url?: string;
  title?: string;
  [key: string]: unknown;
}

// Models sometimes HTML-escape the code they write.
export function decodeHtmlEntities(code: string): string {
  return code
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

// Top-level packages the code imports that the sandbox does not ship, for it to pip install.
export function findMissingPythonPackages(code: string): string[] {
  const imported = new Set<string>();
  for (const match of code.matchAll(/^\s*(?:import|from)\s+(\w+)/gm)) imported.add(match[1]);
  return Array.from(imported).filter((lib) => !PYTHON_LIBS_AVAILABLE.includes(lib));
}

async function uploadChart(
  chart: ChartArtifact,
  fallbackTitle: string,
): Promise<{ url: string; title?: string } | null> {
  if (chart.png) {
    try {
      const buffer = Buffer.from(chart.png.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      const key = `zetora/charts/${nanoid()}.png`;
      const { client, bucketName, publicUrl } = getStorageClient();
      await client.send(new PutObjectCommand({ Bucket: bucketName, Key: key, Body: buffer, ContentType: 'image/png' }));
      return { url: `${publicUrl}/${key}`, title: chart.title || fallbackTitle };
    } catch (uploadError) {
      log.error('Failed to upload chart to storage:', uploadError);
      return null;
    }
  }
  if (chart.url) return { url: chart.url, title: chart.title || fallbackTitle };
  return null;
}

export function createCodeRunnerTool({ emit }: AgentToolContext) {
  return tool({
    description: `Run Python code in a sandbox. Every run starts from a fresh sandbox: files and variables from earlier runs are gone. IMPORTANT: Only ONE chart per execution — never create multiple charts in a single run. Use plt.show() to display charts, NOT plt.savefig() which does not work in this environment. Pre-installed libraries: ${PYTHON_LIBS_AVAILABLE.join(', ')}. Other packages will be auto-installed via pip.`,
    inputSchema: z.object({
      title: z.string().describe('The title of what you are running the code for'),
      code: z.string().describe('The Python code to run. Use plt.show() for charts, NOT savefig().'),
    }),
    execute: async ({ title, code: rawCode }) => {
      const code = decodeHtmlEntities(rawCode);
      log.debug('Running code:', code);

      const codeId = `code-${nanoid()}`;
      emit({ kind: 'code', codeId, title, code, status: 'running' });

      const response = await getSandboxProvider().execute(code, 30000, findMissingPythonPackages(code));

      // Chart PNGs go to storage; the model and the card only get { url, title }.
      const chartTasks = Object.fromEntries(
        ((response.charts || []) as ChartArtifact[]).map((chart, index) => [
          `chart-${index}`,
          () => uploadChart(chart, title || `Chart ${index + 1}`),
        ]),
      );
      const charts = Object.values(await all(chartTasks, getBetterAllOptions())).filter(Boolean);
      log.debug('Charts uploaded:', charts);

      emit({ kind: 'code', codeId, title, code, status: 'completed', result: response.stdout, charts });
      return { title, result: response.stdout, charts };
    },
  });
}
