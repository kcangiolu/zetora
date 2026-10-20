import { createServer, type IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { config } from './config.js';
import {
  enrollGateway,
  reportAgentEvent,
  reportConnectionStatus,
  reportToolStep,
  uploadGatewayMedia,
  verifyGatewayAuth,
} from './internalClient.js';
import { parseGatewayBearerToken } from './adapter/auth.js';
import { buildDescriptorFrame } from './adapter/capabilityDescriptor.js';
import { parseFrames, sendFrame } from './adapter/frames.js';
import { registerConnection, unregisterConnection, getConnection } from './connections.js';
import { isAuthorizedInternalCaller } from './internalAuth.js';

// Handshake (hello -> descriptor) + bidirectional text/edit/typing/react/media:
// `outbound` (agent replies, gateway -> connector), /control/deliver (Zetora user
// messages, connector -> gateway as `inbound` frames), and /relay/media (gateway media
// re-host uploads). follow_up/threads are still later phases — see README.md's "not yet
// implemented" notes; frames for those are logged and dropped, never crash the connection.
const wss = new WebSocketServer({ noServer: true });

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200).end('ok');
    return;
  }
  if (req.method === 'POST' && req.url === '/relay/enroll') {
    void handleEnroll(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/control/deliver') {
    void handleDeliver(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/relay/media') {
    void handleMediaUpload(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/relay/tool-event') {
    void handleToolEvent(req, res);
    return;
  }
  res.writeHead(404).end();
});

// docs/relay-connector-contract.md §4 send_media: a gateway re-hosts media it wants to
// send by POSTing the raw bytes here (auth = same per-gateway HMAC bearer as the WS
// upgrade), then cites `{connector}/relay/media/{id}` back as the outbound action's
// source_url. 25MB cap per the contract's `mediaStore.ts` MEDIA_MAX_BYTES convention.
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;

class PayloadTooLargeError extends Error {}

function readRawBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new PayloadTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleMediaUpload(req: IncomingMessage, res: import('node:http').ServerResponse) {
  const parsed = parseGatewayBearerToken(req.headers.authorization);
  if (!parsed) {
    res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'missing_or_malformed_token' }));
    return;
  }

  const auth = await verifyGatewayAuth(parsed);
  if (!auth.valid) {
    res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: auth.reason ?? 'invalid' }));
    return;
  }

  let body: Buffer;
  try {
    body = await readRawBody(req, MAX_MEDIA_BYTES);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      res.writeHead(413, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'payload_too_large' }));
      return;
    }
    console.error('[hermes-relay] media read failed', error);
    res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'internal_error' }));
    return;
  }

  const contentType = req.headers['content-type'] || 'application/octet-stream';
  const filenameHeader = req.headers['x-media-filename'];
  const filename = typeof filenameHeader === 'string' ? decodeURIComponent(filenameHeader) : null;

  try {
    const result = await uploadGatewayMedia({ gatewayId: parsed.gatewayId, contentType, filename, body });
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ id: result.id, size: body.length }));
  } catch (error) {
    console.error('[hermes-relay] media upload failed', error);
    res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'internal_error' }));
  }
}

// Not part of the relay contract: Zetora's own Hermes plugin (hermes-plugin/zetora) reports
// each tool call of a Zetora chat here as a structured step, under the same per-gateway
// bearer token as the WS upgrade and /relay/media. A step is a few short strings.
const MAX_TOOL_EVENT_BYTES = 16 * 1024;

async function handleToolEvent(req: IncomingMessage, res: import('node:http').ServerResponse) {
  const parsed = parseGatewayBearerToken(req.headers.authorization);
  if (!parsed) {
    res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'missing_or_malformed_token' }));
    return;
  }

  const auth = await verifyGatewayAuth(parsed);
  if (!auth.valid) {
    res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: auth.reason ?? 'invalid' }));
    return;
  }

  let event: unknown;
  try {
    event = JSON.parse((await readRawBody(req, MAX_TOOL_EVENT_BYTES)).toString('utf8'));
  } catch (error) {
    const tooLarge = error instanceof PayloadTooLargeError;
    res
      .writeHead(tooLarge ? 413 : 400, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ error: tooLarge ? 'payload_too_large' : 'invalid_json' }));
    return;
  }

  try {
    const result = await reportToolStep({ gatewayId: parsed.gatewayId, event });
    res.writeHead(result.success ? 200 : 400, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
  } catch (error) {
    console.error('[hermes-relay] tool event failed', error);
    res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'internal_error' }));
  }
}

// Called by zetora-app: push a Zetora user's message (or button click) down the gateway's
// live WS as an `inbound` frame. Gated the same way as the reverse direction
// (internalClient.ts) — see docker-compose.yml's comment on why the compose network
// alone isn't a trust boundary.
async function handleDeliver(req: IncomingMessage, res: import('node:http').ServerResponse) {
  if (!isAuthorizedInternalCaller(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ success: false, error: 'unauthorized' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    const gatewayId = typeof body?.gatewayId === 'string' ? body.gatewayId : null;
    const event = body?.event;
    if (!gatewayId || !event || typeof event !== 'object') {
      res
        .writeHead(400, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ success: false, error: 'gatewayId and event are required' }));
      return;
    }

    const ws = getConnection(gatewayId);
    if (!ws) {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ success: false, error: 'gateway_offline' }));
      return;
    }

    sendFrame(ws, { type: 'inbound', event });
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ success: true }));
  } catch (error) {
    console.error('[hermes-relay] deliver failed', error);
    res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ success: false, error: 'internal_error' }));
  }
}

// Matches hermes_cli/gateway_enroll.py's `_post_enroll` EXACTLY (verified by reading that
// file, not the prose doc): it POSTs `{enrollmentToken, gatewayId}` with an
// `Authorization: Bearer <access_token>` header — that access_token comes from whatever
// `gateway.idp.token_url` returns (Zetora's own ambient endpoint, app/api/hermes/idp-token,
// which simply echoes the enrollment token back). It expects back a JSON object whose
// `secret` field is truthy (`_post_enroll` raises otherwise) — the field name `secret`,
// not `gatewaySecret`, is load-bearing here.
async function handleEnroll(req: IncomingMessage, res: import('node:http').ServerResponse) {
  try {
    const body = await readJsonBody(req);
    const enrollmentToken = typeof body?.enrollmentToken === 'string' ? body.enrollmentToken : null;
    const gatewayId = typeof body?.gatewayId === 'string' ? body.gatewayId : null;
    const authHeader = req.headers.authorization;

    if (!enrollmentToken || !gatewayId) {
      res
        .writeHead(400, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: 'enrollmentToken and gatewayId are required' }));
      return;
    }
    // Defense in depth: our own ambient idp-token endpoint always echoes the enrollment
    // token back verbatim as the access_token, so a caller that actually went through
    // that endpoint presents the identical value here. Doesn't replace the connector's
    // own enrollmentToken lookup below — just rejects a malformed/bypassed caller early.
    if (authHeader !== `Bearer ${enrollmentToken}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Invalid caller identity token' }));
      return;
    }

    const result = await enrollGateway({ enrollmentToken, gatewayId });
    if (!result.gatewayId || !result.gatewaySecret) {
      res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: result.error ?? 'Enrollment failed' }));
      return;
    }

    res
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ secret: result.gatewaySecret, gatewayId: result.gatewayId }));
  } catch (error) {
    console.error('[hermes-relay] enroll failed', error);
    res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Internal error' }));
  }
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/relay') {
    socket.destroy();
    return;
  }

  void authenticateUpgrade(req)
    .then((auth) => {
      if (!auth.valid) {
        console.warn('[hermes-relay] rejected WS upgrade:', auth.reason);
        // 4401 mirrors docs/relay-connector-contract.md §6.1's close code for an
        // invalid/revoked per-gateway secret — the gateway treats this specially
        // (a 4401 AFTER a prior successful handshake means "stop reconnecting, the
        // operator revoked me", vs. before any handshake, which stays retryable).
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        handleConnection(ws, auth.gatewayId);
      });
    })
    .catch((error) => {
      console.error('[hermes-relay] upgrade auth failed', error);
      socket.destroy();
    });
});

async function authenticateUpgrade(
  req: IncomingMessage,
): Promise<{ valid: true; gatewayId: string } | { valid: false; reason: string }> {
  const parsed = parseGatewayBearerToken(req.headers.authorization);
  if (!parsed) return { valid: false, reason: 'missing_or_malformed_token' };

  const result = await verifyGatewayAuth(parsed);
  if (!result.valid) return { valid: false, reason: result.reason ?? 'invalid' };

  return { valid: true, gatewayId: parsed.gatewayId };
}

function handleConnection(ws: WebSocket, gatewayId: string) {
  let handshaked = false;
  registerConnection(gatewayId, ws);
  console.log('[hermes-relay] gateway connected:', gatewayId);

  ws.on('message', (data) => {
    for (const frame of parseFrames(data.toString('utf8'))) {
      if (frame.type === 'hello') {
        handshaked = true;
        sendFrame(ws, buildDescriptorFrame());
        console.log('[hermes-relay] handshake complete:', { gatewayId, platform: frame.platform, botId: frame.botId });
        void reportConnectionStatus({ gatewayId, connected: true }).catch((error) =>
          console.error('[hermes-relay] failed to report connection status', error),
        );
        continue;
      }

      if (!handshaked) {
        console.warn('[hermes-relay] frame received before hello, dropping:', frame.type);
        continue;
      }

      if (frame.type === 'outbound') {
        void handleOutboundFrame(ws, gatewayId, frame);
        continue;
      }

      // edit/typing/prompt/interrupt/going_idle/etc. — later phases. Observed and
      // dropped, never crashes the connection.
      console.log('[hermes-relay] frame received (not yet handled):', frame.type);
    }
  });

  ws.on('close', (code) => {
    unregisterConnection(gatewayId, ws);
    console.log('[hermes-relay] gateway disconnected:', { gatewayId, code });
    void reportConnectionStatus({ gatewayId, connected: false }).catch((error) =>
      console.error('[hermes-relay] failed to report connection status', error),
    );
  });

  ws.on('error', (error) => {
    console.error('[hermes-relay] connection error:', { gatewayId, error });
  });
}

// gateway/relay/adapter.py's RelayAdapter.send builds {"op":"send","chat_id","content",
// "reply_to","metadata"} and wraps it in an `outbound` frame with a `requestId` it awaits
// a matching `outbound_result` for (ws_transport.py's `_request_response`). We must always
// answer, even on failure/unsupported-op, or the gateway's outbound call hangs until its
// own timeout.
async function handleOutboundFrame(ws: WebSocket, gatewayId: string, frame: Record<string, unknown>) {
  const requestId = frame.requestId;
  const action = frame.action as Record<string, unknown> | undefined;

  if (typeof requestId !== 'string' || !action) {
    console.warn('[hermes-relay] malformed outbound frame, dropping:', frame);
    return;
  }

  try {
    const result = await reportAgentEvent({ gatewayId, action });
    sendFrame(ws, {
      type: 'outbound_result',
      requestId,
      result: { success: result.success, message_id: result.messageId, error: result.error },
    });
  } catch (error) {
    console.error('[hermes-relay] agent-event report failed', error);
    sendFrame(ws, { type: 'outbound_result', requestId, result: { success: false, error: 'internal_error' } });
  }
}

server.listen(config.port, () => {
  console.log(`[hermes-relay] listening on :${config.port}`);
});
