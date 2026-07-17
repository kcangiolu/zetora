import { tool } from 'ai';
import { z } from 'zod';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import { getSandboxProvider } from '@/lib/sandbox';
import type { SandboxProviderType } from '@/lib/sandbox';
import { storageClient, STORAGE_BUCKET_NAME, STORAGE_PUBLIC_URL } from '@/lib/storage';
import { persistGeneratedFile } from '@/lib/generated-file-storage';
import { validateFileBuffer } from '@/lib/file-integrity';

interface CodeInterpreterContext {
  userPreferences?: {
    'zetora-sandbox-provider'?: SandboxProviderType;
  };
  userId?: string;
  chatId?: string;
}

const CONTENT_TYPE_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
};

function getContentType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return CONTENT_TYPE_MAP[ext] ?? 'application/octet-stream';
}

async function uploadBuffer(
  buffer: Buffer,
  filename: string,
  mediaType: string,
  context: CodeInterpreterContext | undefined,
  toolName: string,
): Promise<string> {
  if (context?.userId) {
    const { url } = await persistGeneratedFile({
      userId: context.userId,
      chatId: context.chatId,
      buffer,
      filename,
      mediaType,
      kind: mediaType === 'image/png' ? 'image' : 'document',
      toolName,
    });
    return url;
  }

  const key = `zetora/${mediaType === 'image/png' ? 'charts' : 'downloads'}/${nanoid()}-${filename}`;
  await storageClient.send(
    new PutObjectCommand({
      Bucket: STORAGE_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mediaType,
    }),
  );
  return `${STORAGE_PUBLIC_URL}/${key}`;
}

export const codeInterpreterTool = tool({
  description:
    'Write and execute Python code. To produce a downloadable file (docx, pptx, pdf, xlsx, csv, zip), save it to disk and call zetora_save_file(path, filename) — it is predefined in the sandbox. The file is uploaded automatically and a download link is returned; do not try to print or return its raw bytes/base64 yourself.',
  inputSchema: z.object({
    title: z.string().describe('The title of the code snippet.'),
    code: z
      .string()
      .describe(
        'The Python code to execute. put the variables in the end of the code to print them. do use the print function in the code to print the variables.',
      ),
    icon: z.enum(['stock', 'date', 'calculation', 'default']).describe('The icon to display for the code snippet.'),
  }),
  execute: async ({ code, title, icon }: { code: string; title: string; icon: string }, { experimental_context }) => {
    console.log('Code:', code);
    console.log('Title:', title);
    console.log('Icon:', icon);

    const context = experimental_context as CodeInterpreterContext | undefined;
    const preferredProvider = context?.userPreferences?.['zetora-sandbox-provider'];
    const provider = getSandboxProvider(preferredProvider);

    const result = await provider.execute(code, 30000);

    console.log('Execution result:', result.stdout);
    console.log('Execution stderr:', result.stderr);

    const message = result.stdout || result.stderr || 'Code executed with no output.';

    let chartPngUrl: string | undefined;
    if (result.charts?.[0]?.png) {
      try {
        chartPngUrl = await uploadBuffer(
          Buffer.from(result.charts[0].png, 'base64'),
          `${nanoid()}.png`,
          'image/png',
          context,
          'code_interpreter',
        );
        console.log('Chart uploaded:', chartPngUrl);
      } catch (uploadError) {
        console.error('Chart upload failed:', uploadError);
      }
    }

    const chart = result.charts?.[0]
      ? {
          type: result.charts[0].type,
          title: result.charts[0].title,
          elements: result.charts[0].elements as any[],
          png: chartPngUrl,
        }
      : undefined;

    const files: Array<{ filename: string; url: string; size: number }> = [];
    const fileErrors: string[] = [];
    for (const file of result.files ?? []) {
      const buffer = Buffer.from(file.content, 'base64');
      const integrityError = validateFileBuffer(buffer, file.filename);
      if (integrityError) {
        fileErrors.push(integrityError);
        continue;
      }
      try {
        const url = await uploadBuffer(buffer, file.filename, getContentType(file.filename), context, 'code_interpreter');
        files.push({ filename: file.filename, url, size: buffer.length });
      } catch (uploadError) {
        fileErrors.push(
          `Failed to upload ${file.filename}: ${uploadError instanceof Error ? uploadError.message : String(uploadError)}`,
        );
      }
    }

    return {
      message: [message.trim(), ...fileErrors].filter(Boolean).join('\n'),
      chart,
      files: files.length > 0 ? files : undefined,
    };
  },
});
