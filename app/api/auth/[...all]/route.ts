import { auth, CLIENT_IP_HEADER, UNTRUSTED_CLIENT_IP } from '@/lib/auth';
import { getClientIp } from '@/lib/rate-limit';
import { toNextJsHandler } from 'better-auth/next-js';

const handler = toNextJsHandler(auth);

// better-auth rate-limits by the first value of a header. Hand it the IP
// resolved like every other limiter here, replacing anything the client sent
// under that name; without a trusted proxy all clients share one bucket.
function withClientIp(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.set(CLIENT_IP_HEADER, getClientIp(request) ?? UNTRUSTED_CLIENT_IP);
  return new Request(request, { headers });
}

export const GET = (request: Request) => handler.GET(withClientIp(request));
export const POST = (request: Request) => handler.POST(withClientIp(request));
