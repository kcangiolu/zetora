// Auto-compresses large images client-side before upload so users don't have
// to manually resize camera-quality photos. Runs in the browser (canvas),
// not on our server — uploads still go straight to R2 via presigned URL
// (see uploadFile in index.tsx / message.tsx), so this never touches a
// serverless request body limit.
const MAX_DIMENSION = 2048;
const TARGET_BYTES = 4 * 1024 * 1024;
const MIN_QUALITY = 0.5;

// Animated GIFs would lose their animation if re-encoded through canvas, so
// they're left untouched — callers must enforce the hard size ceiling on
// them directly instead of relying on compression.
export function isCompressibleImageType(type: string): boolean {
  return type === 'image/jpeg' || type === 'image/png' || type === 'image/webp' || type === 'image/avif';
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

// Best-effort: returns the original file unchanged if the browser can't
// decode it (e.g. HEIC/HEIF outside Safari, where createImageBitmap throws)
// or if compression doesn't actually shrink it. Callers must still enforce
// a hard size ceiling afterwards — this function does not guarantee a size.
export async function compressImageForUpload(file: File): Promise<File> {
  if (file.size <= TARGET_BYTES || !isCompressibleImageType(file.type)) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    // Flatten transparency to white — this path targets large photos, and
    // JPEG (the compression output) has no alpha channel anyway.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    let quality = 0.9;
    let blob = await canvasToBlob(canvas, quality);
    while (blob && blob.size > TARGET_BYTES && quality > MIN_QUALITY) {
      quality -= 0.1;
      blob = await canvasToBlob(canvas, quality);
    }

    if (!blob || blob.size >= file.size) return file;

    const newName = `${file.name.replace(/\.[^./]+$/, '')}.jpg`;
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
