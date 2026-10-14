import { auth, CLIENT_IP_HEADER, UNTRUSTED_CLIENT_IP } from '@/lib/auth';
import { getClientIp } from '@/lib/rate-limit';
import { toNextJsHandler } from 'better-auth/next-js';

const handler = toNextJsHandler(auth);

// better-auth rate-limits by the first value of a header. Hand it the IP
// resolved like every other limiter here, replacing anything the client sent
// under that name; without a trusted proxy all clients share one bucket.
// The body is read into memory first: re-wrapping the incoming stream in a
// new Request leaves a stream better-auth cannot read.
async function withClientIp(request: Request): Promise<Request> {
  const headers = new Headers(request.headers);
  headers.set(CLIENT_IP_HEADER, getClientIp(request) ?? UNTRUSTED_CLIENT_IP);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return new Request(request.url, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    signal: request.signal,
  });
}

export const GET = async (request: Request) => handler.GET(await withClientIp(request));
export const POST = async (request: Request) => handler.POST(await withClientIp(request));
