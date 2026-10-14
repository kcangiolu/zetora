import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import { buildCsp, CSP_HEADER } from '@/lib/csp';

const authRoutes = ['/sign-in', '/sign-up'];
// Pages readable without an account. Everything else requires signing in.
const publicRoutes = [
  ...authRoutes,
  '/two-factor',
  '/about',
  '/privacy-policy',
  '/robots.txt',
  // Public chats; the page itself 404s on a private one.
  '/search/',
  '/share/',
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const cspValue = buildCsp(pathname);
  // Next.js reads the nonce from the CSP request header and stamps it on its
  // own inline scripts; without it the policy would block the app's bootstrap.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CSP_HEADER, cspValue);

  function next(): NextResponse {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set(CSP_HEADER, cspValue);
    return response;
  }

  function redirect(url: URL): NextResponse {
    const response = NextResponse.redirect(url);
    response.headers.set(CSP_HEADER, cspValue);
    return response;
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

  // API routes check the session themselves and answer 401.
  if (!sessionCookie && !pathname.startsWith('/api/') && !publicRoutes.some((route) => pathname.startsWith(route))) {
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
