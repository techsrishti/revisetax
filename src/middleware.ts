import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from './utils/supabase/server'
// Add matcher configuration
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = await createClient()

   const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }



  const {
    data: { user },
  } = await supabase.auth.getUser()
  console.log(user)

  // Protected routes
  const protectedPaths = ['/dashboard']
  const isProtectedPath = protectedPaths.some((path) => 
    request.nextUrl.pathname.startsWith(path)
  )

 
  // If trying to access a protected route without being authenticated
  if (isProtectedPath && !user) {
    return NextResponse.redirect(new URL('/auth/signin', request.url))
  }

  // If accessing auth pages while authenticated (except signup)
  if (user && request.nextUrl.pathname.startsWith('/auth') && !request.nextUrl.pathname.startsWith('/auth/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}