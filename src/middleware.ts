import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from './utils/supabase/server'

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

  // Define protected routes
  const protectedPaths = ['/dashboard', '/admin-dashboard']
  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  )

  // If trying to access a protected route without being authenticated
  if (isProtectedPath && !user) {
    return NextResponse.redirect(new URL('/auth/signin', request.url))
  }

  // If authenticated but missing phone, redirect to signup with params
  if (isProtectedPath && user && !user.phone) {
    return NextResponse.redirect(
      new URL(
        `/auth/signup?email=${user.email}&name=${user.user_metadata?.name}&provider=${user.app_metadata?.provider}&providerId=${user.id}`,
        request.url
      )
    )
  }

  // If accessing auth pages while authenticated (except signup), redirect to admin-dashboard
  if (
    user &&
    request.nextUrl.pathname.startsWith('/auth') &&
    !request.nextUrl.pathname.startsWith('/auth/signup')
  ) {
    return NextResponse.redirect(new URL('/admin-dashboard', request.url))
  }

  // Otherwise, allow the request to proceed
  return NextResponse.next()
}