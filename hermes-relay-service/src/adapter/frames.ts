import type { WebSocket } from 'ws';

// Newline-delimited JSON, one frame per line — mirrors gateway/relay/ws_transport.py's
// `await self._ws.send(json.dumps(frame) + "\n")` on the Hermes side exactly.
export function sendFrame(ws: WebSocket, frame: Record<string, unknown>) {
  ws.send(`${JSON.stringify(frame)}\n`);
}

// A single WS text message may carry more than one newline-joined frame (the gateway's
// own reader is written to expect this), so split defensively rather than assuming
// one-frame-per-message.
export function parseFrames(raw: string): Record<string, unknown>[] {
  const frames: Record<string, unknown>[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') frames.push(parsed as Record<string, unknown>);
    } catch {
      // Malformed frame — dropped, not fatal to the connection.
    }
  }
  return frames;
}
