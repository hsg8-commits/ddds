import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ─── Admin Route Protection Middleware ─────────────────────────────
// Protects any route under /admin/* by verifying the session token
// or JWT from the Authorization header or session cookie.

const ADMIN_ROUTES = ['/admin'];

// In production, this would validate against your session store / JWT secret
// For now, it demonstrates the middleware structure with cookie/header checks.
const isAuthorizedAdmin = (request: NextRequest): boolean => {
  // ── Check Authorization header (Bearer token) ───────────────
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    // TODO: Validate JWT token with your secret
    // Example: return verifyToken(token, process.env.JWT_SECRET).role === 'admin';
    return !!token; // Placeholder — always returns true if token exists
  }

  // ── Check session cookie ────────────────────────────────────
  const sessionCookie = request.cookies.get('dawak-session');
  if (sessionCookie?.value) {
    // TODO: Validate session against your session store (Redis, DB, etc.)
    // Example: return checkSession(sessionCookie.value).role === 'admin';
    return !!sessionCookie.value; // Placeholder
  }

  return false;
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Check if the path is an admin route ─────────────────────
  const isAdminRoute = ADMIN_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + '/')
  );

  if (isAdminRoute) {
    if (!isAuthorizedAdmin(request)) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── Security: Enforce HTTPS in production ────────────────────
  const proto = request.headers.get('x-forwarded-proto');
  if (proto === 'http' && process.env.NODE_ENV === 'production') {
    const httpsUrl = new URL(request.url);
    httpsUrl.protocol = 'https';
    return NextResponse.redirect(httpsUrl);
  }

  return NextResponse.next();
}

// ─── Matcher Configuration ────────────────────────────────────────
export const config = {
  matcher: [
    '/admin/:path*',
    '/((?!api|_next/static|_next/image|favicon.ico|public).*)',
  ],
};
