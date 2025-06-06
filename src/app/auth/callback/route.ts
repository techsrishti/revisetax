import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
 
  if (code) {
    try {
      const supabase = await createClient()
      const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)
      
      if (!error && user) {
        console.log('Authenticated user:', user.email)
        
        try {
          // Check if user exists in database by email
          const existingUser = await prisma.user.findFirst({
            where: {
              OR: [
                { email: user.email },
                { providerId: user.id }
              ]
            }
          })

          console.log('Existing user check:', existingUser ? 'Found' : 'Not found')

          if (existingUser) {
            // If user exists, update their social info and redirect to dashboard
            await prisma.user.update({
              where: { id: existingUser.id },
              data: {
                provider: user.app_metadata.provider,
                providerId: user.id,
                updatedAt: new Date()
              }
            })
            return NextResponse.redirect(`${origin}/dashboard`)
          }

          // If user doesn't exist, redirect to signup with social info
          const params: Record<string, string> = {
            email: user.email || '',
            name: user.user_metadata.full_name || '',
            provider: user.app_metadata.provider || '',
            providerId: user.id
          }
          const signupParams = new URLSearchParams(params)
          return NextResponse.redirect(`${origin}/auth/signup?${signupParams.toString()}`)
        } catch (dbError) {
          console.error('Database error:', dbError)
          return NextResponse.redirect(`${origin}/auth/signin?error=Database error occurred`)
        }
      }
      
      console.error('Auth error:', error)
      return NextResponse.redirect(`${origin}/auth/signin?error=${encodeURIComponent(error?.message || 'Authentication failed')}`)
    } catch (error) {
      console.error('Callback error:', error)
      return NextResponse.redirect(`${origin}/auth/signin?error=An unexpected error occurred`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/signin?error=No code provided`)
}
