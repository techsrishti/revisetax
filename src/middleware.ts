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

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protected routes
  const protectedPaths = ['/dashboard']
  const isProtectedPath = protectedPaths.some((path) => 
    request.nextUrl.pathname.startsWith(path)
  )
  // If trying to access a protected route without being authenticated
  if (isProtectedPath && !user ) {
    return NextResponse.redirect(new URL('/auth/signin', request.url))
  }
  
  if (isProtectedPath && !user?.phone) {
    console.log("User phone not found")
    return NextResponse.redirect(new URL(`/auth/signup?email=${user?.email}&name=${user?.user_metadata?.name}&provider=${user?.app_metadata?.provider}&providerId=${user?.id}`, request.url))
  }
  //http://localhost:3000/auth/signup?email=hmarupudi%40gmail.com&name=Hemanth+Marupudi&provider=google&providerId=8260a378-dd95-4281-8d47-3b7c47d7453f
 
  // If accessing auth pages while authenticated (except signup)
  if (user && request.nextUrl.pathname.startsWith('/auth') && !request.nextUrl.pathname.startsWith('/auth/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

}