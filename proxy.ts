import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { buildCsp } from '@/lib/csp';

const authRoutes = ['/sign-in', '/sign-up'];
const protectedRoutes = ['/settings', '/searches'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const { nonce, header: cspHeaderName, value: cspValue } = buildCsp(pathname);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  function next(): NextResponse {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set(cspHeaderName, cspValue);
    return response;
  }

  function redirect(url: URL): NextResponse {
    const response = NextResponse.redirect(url);
    response.headers.set(cspHeaderName, cspValue);
    return response;
  }

  if (pathname.startsWith('/new') || pathname.startsWith('/api/search')) {
    return next();
  }

  // /api/payments/webhooks is a webhook endpoint that should be accessible without authentication
  if (pathname.startsWith('/api/payments/webhooks')) {
    return next();
  }

  // /api/auth/polar/webhooks
  if (pathname.startsWith('/api/auth/polar/webhooks')) {
    return next();
  }

  if (pathname.startsWith('/api/auth/dodopayments/webhooks')) {
    return next();
  }

  if (pathname.startsWith('/api/raycast')) {
    return next();
  }

  const sessionCookie = getSessionCookie(request);

  // If user is authenticated but trying to access auth routes
  if (sessionCookie && authRoutes.some((route) => pathname.startsWith(route))) {
    return redirect(new URL('/', request.url));
  }

  if (!sessionCookie && protectedRoutes.some((route) => pathname.startsWith(route))) {
    return redirect(new URL('/sign-in', request.url));
  }

  return next();
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
