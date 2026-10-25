import { tool } from 'ai';
import { z } from 'zod';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { nanoid } from 'nanoid';
import { getStorageClient } from '@/lib/storage';
import { persistGeneratedFile } from '@/lib/generated-file-storage';
import { validateFileBuffer } from '@/lib/file-integrity';

interface ToolContext {
  userId?: string;
  chatId?: string;
}

const CONTENT_TYPE_MAP: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.zip': 'application/zip',
};

function getContentType(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return CONTENT_TYPE_MAP[ext] ?? 'application/octet-stream';
}

export const downloadFileTool = tool({
  description:
    'Upload a file generated in the sandbox to cloud storage and return a secure download link. Use after generating a document (PDF, DOCX, PPTX, XLSX, CSV, ZIP) via code_interpreter.',
  inputSchema: z.object({
    content: z.string().describe('Base64-encoded file content (without the data:... prefix, just raw base64 string)'),
    filename: z
      .string()
      .describe('Suggested download filename with extension, e.g. "report.pdf", "presentation.pptx", "data.xlsx"'),
  }),
  execute: async ({ content, filename }, { experimental_context }: { experimental_context?: unknown } = {}) => {
    const context = experimental_context as ToolContext | undefined;
    try {
      const buffer = Buffer.from(content, 'base64');
      const integrityError = validateFileBuffer(buffer, filename);
      if (integrityError) {
        return { success: false, error: integrityError };
      }
      const contentType = getContentType(filename);

      let url: string;
      if (context?.userId) {
        ({ url } = await persistGeneratedFile({
          userId: context.userId,
          chatId: context.chatId,
          buffer,
          filename,
          mediaType: contentType,
          kind: 'document',
          toolName: 'download_file',
        }));
      } else {
        // No authenticated user in context — keep the file usable without a
        // Downloads-panel record (nothing to attribute it to).
        const key = `zetora/downloads/${nanoid()}-${filename}`;
        const {
          client: storageClient,
          bucketName: STORAGE_BUCKET_NAME,
          publicUrl: STORAGE_PUBLIC_URL,
        } = getStorageClient();
        await storageClient.send(
          new PutObjectCommand({
            Bucket: STORAGE_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
          }),
        );
        url = `${STORAGE_PUBLIC_URL}/${key}`;
      }

      return {
        success: true,
        url,
        filename,
        message: `File ready for download: ${filename}`,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to upload file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
