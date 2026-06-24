import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Protected routes: everything under the dashboard route group.
const protectedPaths = ['/analytics', '/clients', '/inventory', '/marketplace', '/chat', '/party-form', '/settings'];
const authPaths = ['/login', '/signup', '/forgot-password'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check for Supabase auth cookie presence
  const hasAuthCookie = request.cookies.getAll().some(c =>
    c.name.startsWith('sb-') && c.name.includes('auth-token')
  );

  // If protected page and no auth cookie, redirect to login
  if (protectedPaths.some(p => pathname.startsWith(p)) && !hasAuthCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If auth page and has cookie, redirect to dashboard
  if (authPaths.some(p => pathname.startsWith(p)) && hasAuthCookie) {
    return NextResponse.redirect(new URL('/analytics', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/analytics/:path*', '/clients/:path*', '/inventory/:path*',
    '/marketplace/:path*', '/chat/:path*', '/party-form/:path*',
    '/settings/:path*', '/login', '/signup', '/forgot-password',
  ],
};
