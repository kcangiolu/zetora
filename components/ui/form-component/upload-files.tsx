import { AlertCircle, Upload, X } from 'lucide-react';
import { sileo } from 'sileo';

import { uploadFileToStorage } from '@/lib/upload-client';
import { getMaxSizeForFile, getOversizedFileReason, MAX_FILES, MAX_UPLOADED_IMAGE_SIZE } from './attachment-utils';
import { compressImageForUpload } from './image-compression';

// The upload steps shared by every place a user attaches files (the composer's
// picker, drop and paste, and the message editor).

export interface UploadedFile {
  name: string;
  contentType: string;
  url: string;
  size: number;
}

/**
 * The files that can be uploaded next to `currentCount` existing attachments.
 * Oversized files are reported and left out; going over the attachment limit
 * is reported and uploads nothing.
 */
export function selectUploadableFiles(files: File[], currentCount: number): File[] {
  const uploadable = files.filter((file) => {
    if (file.size <= getMaxSizeForFile(file)) return true;
    sileo.error({
      title: `${file.name || 'Pasted image'} is too large`,
      description: getOversizedFileReason(file),
      icon: <AlertCircle className="h-4 w-4" />,
    });
    return false;
  });

  if (currentCount + uploadable.length > MAX_FILES) {
    sileo.error({ title: `You can only attach up to ${MAX_FILES} files.` });
    return [];
  }
  return uploadable;
}

async function uploadFile(file: File): Promise<UploadedFile> {
  const isImage = file.type.startsWith('image/');
  const fileToUpload = isImage ? await compressImageForUpload(file) : file;

  if (isImage && fileToUpload.size > MAX_UPLOADED_IMAGE_SIZE) {
    throw new Error(
      `Still over ${MAX_UPLOADED_IMAGE_SIZE / (1024 * 1024)}MB after compression — try a smaller or simpler image, or an animated GIF/HEIC photo that can't be auto-compressed.`,
    );
  }

  const { url, name, contentType } = await uploadFileToStorage(fileToUpload);
  return { name, contentType, url, size: fileToUpload.size };
}

/**
 * Uploads the files in parallel. Each failure is reported with its reason and
 * left out, so the others still attach.
 */
export async function uploadFiles(files: File[]): Promise<UploadedFile[]> {
  const settled = await Promise.allSettled(files.map(uploadFile));

  const uploaded: UploadedFile[] = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      uploaded.push(result.value);
      return;
    }
    console.error(`Error uploading ${files[index].name}:`, result.reason);
    sileo.error({
      title: `Failed to upload ${files[index].name || 'pasted image'}`,
      description: result.reason instanceof Error ? result.reason.message : 'Unknown error',
      icon: <X className="h-4 w-4" />,
    });
  });

  if (uploaded.length > 0) {
    sileo.success({
      title: `${uploaded.length} file${uploaded.length > 1 ? 's' : ''} uploaded`,
      icon: <Upload className="h-4 w-4" />,
    });
  }
  return uploaded;
}
