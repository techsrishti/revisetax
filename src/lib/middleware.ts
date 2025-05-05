import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Add matcher configuration
export const config = {
  matcher: [
   
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
    '/auth/:path*',
    '/new-dashboard/:path*'
  ],
}

export async function middleware(request: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req: request, res })

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Protected routes
  const protectedPaths = ['/new-dashboard']
  const isProtectedPath = protectedPaths.some((path) => 
    request.nextUrl.pathname.startsWith(path)
  )

  // If trying to access a protected route without being authenticated
  if (isProtectedPath && !session) {
    return NextResponse.redirect(new URL('/auth/signin', request.url))
  }

  // If accessing auth pages while authenticated
  if (session && (request.nextUrl.pathname.startsWith('/auth'))) {
    return NextResponse.redirect(new URL('/new-dashboard', request.url))
  }

  return res
}