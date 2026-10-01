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
    const errorText = await presignResponse.text();
    throw new Error(`Failed to get upload URL: ${presignResponse.status} ${errorText}`);
  }
  const { presignedUrl, key } = await presignResponse.json();

  const uploadResponse = await fetch(presignedUrl, {
    method: 'PUT',
    body: file,
    // Must match the contentType sent above: it's part of the presigned
    // SigV4 signature, and any mismatch makes storage reject the PUT.
    headers: { 'Content-Type': file.type },
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
