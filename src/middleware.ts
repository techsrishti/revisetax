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
    '/admin-dashboard/:path*',
  ],
}

export async function middleware(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Define protected routes
  const protectedPaths = ['/dashboard']
  const adminPaths = ['/admin-dashboard']
  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  )
  const isAdminPath = adminPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  )

  // If trying to access a protected route without being authenticated
  if (isProtectedPath && !user) {
    return NextResponse.redirect(new URL('/auth/signin', request.url))
  }

  // If trying to access admin route without being authenticated
  if (isAdminPath && !user) {
    return NextResponse.redirect(new URL('/admin/login', request.url))
  }

  // If authenticated but missing phone, redirect to signup with params (only for regular users, not admin)
  if (isProtectedPath && user && !user.phone) {
    return NextResponse.redirect(
      new URL(
        `/auth/signup?email=${user.email}&name=${user.user_metadata?.name}&provider=${user.app_metadata?.provider}&providerId=${user.id}`,
        request.url
      )
    )
  }

  // If accessing auth pages while authenticated, redirect appropriately
  if (user && request.nextUrl.pathname.startsWith('/auth/signin')) {
    // Check if user is admin (you might want to add proper admin role checking here)
    // For now, redirect all authenticated users trying to access signin to their appropriate dashboard
    const userEmail = user.email?.toLowerCase()
    const isAdmin = userEmail?.includes('admin') || userEmail?.endsWith('@revisetax.com')  
    
    if (isAdmin) {
      return NextResponse.redirect(new URL('/admin-dashboard', request.url))
    } else {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // If accessing admin login while already authenticated as admin
  if (user && request.nextUrl.pathname.startsWith('/admin/login')) {
    return NextResponse.redirect(new URL('/admin-dashboard', request.url))
  }

  // If trying to access admin dashboard
  if (request.nextUrl.pathname.startsWith('/admin-dashboard')) {
    if (!user) {
      // Redirect to admin login if no session
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }

    try {
      // Check MFA status
      const { data: factorsData, error: factorsError } = await supabase.auth.mfa.listFactors()
      const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

      // Only proceed with MFA checks if we can successfully fetch the data
      if (!factorsError && !aalError) {
        // Verify that:
        // 1. User has TOTP factor enrolled
        // 2. Current authentication level is AAL2 (meaning TOTP was verified)
        const hasTOTP = factorsData?.totp?.some(factor => factor.status === 'verified')
        const isTOTPVerified = aalData?.currentLevel === 'aal2'

        if (!hasTOTP || !isTOTPVerified) {
          // If TOTP is not set up or not verified, redirect to login
          await supabase.auth.signOut() // Sign out for security
          return NextResponse.redirect(new URL('/admin/login', request.url))
        }
      } else {
        // If we can't check MFA status due to errors, log and continue
        console.warn('MFA check failed in middleware:', { factorsError, aalError })
        // Don't block access if MFA check fails due to API issues
      }
    } catch (mfaError) {
      console.warn('MFA middleware check failed:', mfaError)
      // Don't block access if MFA check fails due to errors
    }
  }

  // Otherwise, allow the request to proceed
  return NextResponse.next()
}