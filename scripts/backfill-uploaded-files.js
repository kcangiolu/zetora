// One-off backfill of uploaded_file (migration 0022) from files uploaded
// before that table existed. Safe to re-run: rows are keyed on the storage
// key and existing ones are left untouched.
//
// Every object under zetora/users/<userId>/ (except generated/, which is
// Settings → Downloads) gets a row. Its date, name, type and chat come from
// the first user message that attached it when there is one; otherwise from
// the object itself (LastModified may be the date it was copied during a
// storage migration rather than the original upload date).
//
// Runs in the zetora-migrate image, which already has the dependencies. The
// db-migrate service doesn't get the storage settings (they live in
// zetora-app's `environment:`), so pass zetora-app's own values through:
//   mapfile -t vars < <(docker inspect zetora-app --format '{{range .Config.Env}}{{println .}}{{end}}' \
//     | grep -E '^(STORAGE_PROVIDER|S3_[A-Z_]+|R2_[A-Z_]+)=')
//   args=(); for v in "${vars[@]}"; do args+=(-e "$v"); done
//   docker compose run --rm "${args[@]}" db-migrate node scripts/backfill-uploaded-files.js [--dry-run]

import { HeadObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { Client } from 'pg';
import { randomUUID } from 'node:crypto';

const dryRun = process.argv.includes('--dry-run');

// Mirrors buildStorageConfig in lib/storage.ts (a TS module this plain
// script can't import), restricted to what listing and HEAD need.
function storageConfig() {
  if (process.env.STORAGE_PROVIDER === 'minio') {
    return {
      client: new S3Client({
        region: process.env.S3_REGION || 'us-east-1',
        endpoint: process.env.S3_ENDPOINT || 'http://localhost:9000',
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin',
        },
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      }),
      bucketName: process.env.S3_BUCKET_NAME || 'zetora-uploads',
      publicUrl: process.env.S3_PUBLIC_URL || 'http://localhost:9000/zetora-uploads',
    };
  }
  return {
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    }),
    bucketName: process.env.R2_BUCKET_NAME,
    publicUrl: process.env.R2_PUBLIC_URL,
  };
}

const UPLOAD_KEY_PATTERN = /^zetora\/users\/([^/]+)\/[^/]+$/;

async function listUploadObjects(client, bucketName) {
  const objects = [];
  let continuationToken;
  do {
    const page = await client.send(
      new ListObjectsV2Command({ Bucket: bucketName, Prefix: 'zetora/users/', ContinuationToken: continuationToken }),
    );
    for (const object of page.Contents ?? []) {
      const match = UPLOAD_KEY_PATTERN.exec(object.Key);
      if (match)
        objects.push({ key: object.Key, userId: match[1], size: object.Size, lastModified: object.LastModified });
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

// First user message attaching each URL, with the chat it belongs to and
// that chat's owner (so a chat is only linked to its owner's upload).
// Dates stay text end to end, like the UTC wall-clock values the app writes:
// letting pg turn them into JS Dates would shift them by the host's timezone.
async function firstAttachmentsByUrl(db) {
  const { rows } = await db.query(`
    SELECT DISTINCT ON (elem->>'url')
      elem->>'url'       AS url,
      elem->>'name'      AS name,
      elem->>'mediaType' AS "mediaType",
      m.created_at::text AS "createdAt",
      m.chat_id          AS "chatId",
      c."userId"         AS "chatUserId"
    FROM message m
    JOIN chat c ON c.id = m.chat_id
    CROSS JOIN LATERAL jsonb_array_elements(m.parts::jsonb) AS elem
    WHERE m.role = 'user' AND elem->>'type' = 'file'
    ORDER BY elem->>'url', m.created_at ASC
  `);
  return new Map(rows.map((row) => [row.url, row]));
}

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('[backfill-uploaded-files] ERROR: DATABASE_URL is required');
  process.exit(1);
}

const storage = storageConfig();
const db = new Client({ connectionString: DATABASE_URL });
await db.connect();

try {
  // One pg Client runs one query at a time, so the DB reads are sequential.
  const objects = await listUploadObjects(storage.client, storage.bucketName);
  const attachments = await firstAttachmentsByUrl(db);
  const users = new Set((await db.query('SELECT id FROM "user"')).rows.map((row) => row.id));
  const existing = new Set((await db.query('SELECT key FROM uploaded_file')).rows.map((row) => row.key));

  let inserted = 0;
  let fromMessage = 0;
  let skippedUnknownUser = 0;
  for (const object of objects) {
    if (existing.has(object.key)) continue;
    if (!users.has(object.userId)) {
      skippedUnknownUser++;
      continue;
    }

    const url = `${storage.publicUrl}/${object.key}`;
    const attachment = attachments.get(url);
    let mediaType = attachment?.mediaType || null;
    if (!mediaType) {
      const head = await storage.client
        .send(new HeadObjectCommand({ Bucket: storage.bucketName, Key: object.key }))
        .catch(() => null);
      mediaType = head?.ContentType ?? null;
    }
    if (attachment) fromMessage++;

    const row = {
      id: randomUUID(),
      userId: object.userId,
      chatId: attachment && attachment.chatUserId === object.userId ? attachment.chatId : null,
      key: object.key,
      url,
      filename: attachment?.name || object.key.split('/').pop(),
      mediaType,
      sizeBytes: object.size ?? null,
      createdAt: attachment?.createdAt ?? object.lastModified.toISOString(),
    };

    if (!dryRun) {
      await db.query(
        `INSERT INTO uploaded_file (id, user_id, chat_id, key, url, filename, media_type, size_bytes, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamp)
         ON CONFLICT (key) DO NOTHING`,
        [row.id, row.userId, row.chatId, row.key, row.url, row.filename, row.mediaType, row.sizeBytes, row.createdAt],
      );
    }
    inserted++;
  }

  console.log(
    `[backfill-uploaded-files]${dryRun ? ' (dry run)' : ''} objects: ${objects.length}, ` +
      `already recorded: ${objects.filter((object) => existing.has(object.key)).length}, ` +
      `${dryRun ? 'would insert' : 'inserted'}: ${inserted} (${fromMessage} dated from their message, ` +
      `${inserted - fromMessage} from storage), skipped (unknown user): ${skippedUnknownUser}`,
  );
} finally {
  await db.end();
}
