import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
export function middleware(request: NextRequest) {
  const nonce = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18))),
  );
  const dev = request.nextUrl.hostname === 'localhost';
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${dev ? "'unsafe-eval'" : ''}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com ${dev ? 'ws://localhost:*' : ''}; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;
  const headers = new Headers(request.headers);
  headers.set('Content-Security-Policy', csp);
  const r = NextResponse.next({ request: { headers } });
  r.headers.set('X-Content-Type-Options', 'nosniff');
  r.headers.set('X-Frame-Options', 'DENY');
  r.headers.set('Referrer-Policy', 'no-referrer');
  r.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  r.headers.set('Cache-Control', 'no-store');
  r.headers.set('Content-Security-Policy', csp);
  if (!dev)
    r.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
  return r;
}
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
