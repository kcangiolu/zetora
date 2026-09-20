import { config } from './config.js';

// The only code in this service that talks to zetora-app. Every trust decision (does
// this enrollment token belong to a real, still-valid connector? is this gateway's HMAC
// valid?) and every durable write lives on that side — this service holds no database
// credentials of its own. See docker-compose.yml's comment on this port not being
// loopback-restricted by default: HERMES_RELAY_INTERNAL_SECRET is the real access control.
async function postInternal<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${config.zetoraInternalUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.internalSecret}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 400 && res.status !== 401 && res.status !== 404) {
    throw new Error(`zetora-app internal call to ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface EnrollResult {
  gatewayId?: string;
  gatewaySecret?: string;
  error?: string;
}

export function enrollGateway(params: { enrollmentToken: string; gatewayId: string }): Promise<EnrollResult> {
  return postInternal<EnrollResult>('/api/internal/hermes/enroll', params);
}

export interface VerifyGatewayAuthResult {
  valid: boolean;
  userId?: string;
  reason?: string;
}

export function verifyGatewayAuth(params: {
  gatewayId: string;
  payload: string;
  exp: string;
  sig: string;
}): Promise<VerifyGatewayAuthResult> {
  return postInternal<VerifyGatewayAuthResult>('/api/internal/hermes/verify-gateway-auth', params);
}

export interface AgentEventResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Forwards a gateway-originated `outbound` action (send/edit/typing/...) to zetora-app,
// which persists it and pushes it live to any open browser tab. The result becomes this
// service's `outbound_result` reply to the gateway.
export function reportAgentEvent(params: {
  gatewayId: string;
  action: Record<string, unknown>;
}): Promise<AgentEventResult> {
  return postInternal<AgentEventResult>('/api/internal/hermes/agent-event', params);
}

export function reportConnectionStatus(params: {
  gatewayId: string;
  connected: boolean;
  error?: string | null;
}): Promise<{ success?: boolean; error?: string }> {
  return postInternal('/api/internal/hermes/connection-status', params);
}
