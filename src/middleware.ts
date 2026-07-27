// 🛡️ Mirai OS Middleware — Edge Runtime Compatible
// No Node.js native modules or better-sqlite3 imports allowed
import { jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback');

// ─── PUBLIC PATHS (no auth needed) ────────────────────────────────
const PUBLIC_PATHS = [
  '/api/auth',
  '/login',
  '/register',
  '/_next/static',
  '/_next/image',
  '/favicon.ico',
  '/manifest.json',
  '/sw.js',
  '/icons',
  '/',
  '/system',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => {
    if (p === '/') return pathname === '/';
    return pathname.startsWith(p);
  });
}

// ─── PROTECTED PATHS (need valid token) ───────────────────────────
const PROTECTED_PATHS = ['/dashboard', '/canais'];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((p) => pathname.startsWith(p));
}

// ─── REQUEST PATH NORMALISATION ───────────────────────────────────
function getPathname(request: NextRequest): string {
  return new URL(request.url).pathname;
}

// ─── TOKEN EXTRACTION ─────────────────────────────────────────────
function extractToken(request: NextRequest): string | null {
  // Try Authorization header first (Bearer token)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // Fall back to cookie
  const tokenCookie = request.cookies.get('token')?.value;
  return tokenCookie || null;
}

// ─── TOKEN VERIFICATION ───────────────────────────────────────────
async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as { userId: number; email: string; tenantId?: string };
  } catch {
    return null;
  }
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────
export async function middleware(request: NextRequest) {
  const pathname = getPathname(request);
  const isApiRoute = pathname.startsWith('/api/');

  // 1. Public paths → allow through
  if (isPublicPath(pathname)) {
    // 1a. If user is on /login or /register AND has a valid token → redirect to dashboard
    if (pathname === '/login' || pathname === '/register') {
      const token = extractToken(request);
      if (token) {
        const payload = await verifyToken(token);
        if (payload) {
          return NextResponse.redirect(new URL('/dashboard/connect', request.url));
        }
      }
    }
    return NextResponse.next();
  }

  // 2. Protected paths → check token
  if (isProtectedPath(pathname)) {
    const token = extractToken(request);
    if (!token) {
      return isApiRoute
        ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        : NextResponse.redirect(new URL('/login', request.url));
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return isApiRoute
        ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        : NextResponse.redirect(new URL('/login', request.url));
    }

    // Token is valid — clone request with user info in headers for downstream handlers
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', String(payload.userId));
    requestHeaders.set('x-user-email', payload.email);
    if (payload.tenantId) {
      requestHeaders.set('x-tenant-id', payload.tenantId);
    }

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  }

  // 3. Everything else (other /api/* routes, unknown paths) → allow through
  return NextResponse.next();
}

// ─── CONFIG ───────────────────────────────────────────────────────
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|sw.js|manifest.json).*)'],
};
