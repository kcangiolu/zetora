// Browser-side upload of a user file, shared by every UI that attaches one.
// Three steps: POST /api/upload hands out a presigned URL, the bytes are PUT
// straight to storage, then POST /api/upload/confirm records the file in
// uploaded_file. Skipping the confirm would leave the file working in chat
// but missing from Settings → Uploads.
export interface StoredUpload {
  url: string;
  name: string;
  contentType: string;
}

export async function uploadFileToStorage(file: File): Promise<StoredUpload> {
  const presignResponse = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
  });
  if (!presignResponse.ok) {
    const body: unknown = await presignResponse.json().catch(() => null);
    const reason =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `HTTP ${presignResponse.status}`;
    throw new Error(`Failed to get upload URL: ${reason}`);
  }
  const { presignedUrl, key, contentType } = await presignResponse.json();

  const uploadResponse = await fetch(presignedUrl, {
    method: 'PUT',
    body: file,
    // The type storage will serve, signed into the presigned URL: any other
    // value makes storage reject the PUT. The browser sends the matching
    // Content-Length from the file itself.
    headers: { 'Content-Type': contentType },
  });
  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload file: ${uploadResponse.status}`);
  }

  const confirmResponse = await fetch('/api/upload/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, filename: file.name }),
  });
  if (!confirmResponse.ok) {
    const errorText = await confirmResponse.text();
    throw new Error(`Failed to record upload: ${confirmResponse.status} ${errorText}`);
  }
  const { url } = await confirmResponse.json();

  return { url, name: file.name, contentType: file.type };
}
