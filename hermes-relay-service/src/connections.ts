import type { WebSocket } from 'ws';

// In-memory only, by design (see README.md): losing this on restart is fine because a
// Hermes gateway that dials out and gets dropped simply reconnects (that's its own
// reconnect-loop behavior, not something this service needs to compensate for). This
// service intentionally holds no durable state and no database credentials.
const liveConnections = new Map<string, WebSocket>();

export function registerConnection(gatewayId: string, ws: WebSocket) {
  liveConnections.set(gatewayId, ws);
}

export function unregisterConnection(gatewayId: string, ws: WebSocket) {
  if (liveConnections.get(gatewayId) === ws) {
    liveConnections.delete(gatewayId);
  }
}

export function getConnection(gatewayId: string): WebSocket | undefined {
  return liveConnections.get(gatewayId);
}
