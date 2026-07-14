import { tool } from 'ai';
import { z } from 'zod';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import { getSandboxProvider } from '@/lib/sandbox';
import type { SandboxProviderType } from '@/lib/sandbox';
import { storageClient, STORAGE_BUCKET_NAME, STORAGE_PUBLIC_URL } from '@/lib/storage';
import { persistGeneratedFile } from '@/lib/generated-file-storage';

interface CodeInterpreterContext {
  userPreferences?: {
    'zetora-sandbox-provider'?: SandboxProviderType;
  };
  userId?: string;
  chatId?: string;
}

export const codeInterpreterTool = tool({
  description: 'Write and execute Python code.',
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
        const buffer = Buffer.from(result.charts[0].png, 'base64');
        if (context?.userId) {
          const { url } = await persistGeneratedFile({
            userId: context.userId,
            chatId: context.chatId,
            buffer,
            filename: `${nanoid()}.png`,
            mediaType: 'image/png',
            kind: 'image',
            toolName: 'code_interpreter',
          });
          chartPngUrl = url;
        } else {
          const key = `zetora/charts/${nanoid()}.png`;
          await storageClient.send(
            new PutObjectCommand({
              Bucket: STORAGE_BUCKET_NAME,
              Key: key,
              Body: buffer,
              ContentType: 'image/png',
            }),
          );
          chartPngUrl = `${STORAGE_PUBLIC_URL}/${key}`;
        }
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

    return {
      message: message.trim(),
      chart,
    };
  },
});
