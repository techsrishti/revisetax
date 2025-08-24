import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { prisma } from '@/lib/prisma'
import { downloadAndUploadImageToS3 } from '@/utils/s3-client'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL

  // Use environment variable for production redirects, fallback to origin for development
  const baseUrl = process.env.NODE_ENV === 'production' 
    ? process.env.NEXT_PUBLIC_URL 
    : origin;

  if (code) {
    try {
      const supabase = await createClient()
      
      // For PKCE flow, we need to ensure the code verifier is available
      // The @supabase/ssr package should handle this automatically via cookies
      console.log('Attempting to exchange code for session:', code.substring(0, 10) + '...')
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
            // If user exists, update their social info and handle profile picture
            const updateData: any = {
              provider: user.app_metadata.provider,
              providerId: user.id,
              updatedAt: new Date()
            }

            // Handle profile picture from various social providers
            const profileImageUrl = getProfileImageUrl(user);
            if (profileImageUrl) {
              try {
                console.log(`Downloading ${user.app_metadata.provider} profile picture for existing user:`, profileImageUrl)
                const s3ProfileImagePath = await downloadAndUploadImageToS3(
                  profileImageUrl, 
                  user.id, 
                  user.app_metadata.provider
                )
                
                if (s3ProfileImagePath) {
                  updateData.profileImage = s3ProfileImagePath
                  console.log(`Successfully stored ${user.app_metadata.provider} profile picture in S3:`, s3ProfileImagePath)
                } else {
                  console.warn(`Failed to download/upload ${user.app_metadata.provider} profile picture, keeping existing profile image`)
                }
              } catch (profileError) {
                console.error(`Error handling ${user.app_metadata.provider} profile picture for existing user:`, profileError)
                // Continue without updating profile picture
              }
            }

            await prisma.user.update({
              where: { id: existingUser.id },
              data: updateData
            })
            return NextResponse.redirect(`${baseUrl}/dashboard`)
          }

          // If user doesn't exist, redirect to signup with social info including profile picture
          const params: Record<string, string> = {
            email: user.email || '',
            name: user.user_metadata.full_name || user.user_metadata.name || '',
            provider: user.app_metadata.provider || '',
            providerId: user.id
          }

          // Add profile picture URL if available from any social provider
          const profileImageUrl = getProfileImageUrl(user);
          if (profileImageUrl) {
            params.profilePictureUrl = profileImageUrl
          }

          const signupParams = new URLSearchParams(params)
          return NextResponse.redirect(`${baseUrl}/auth/signup?${signupParams.toString()}`)
        } catch (dbError) {
          console.error('Database error:', dbError)
          return NextResponse.redirect(`${baseUrl}/auth/signin?error=Database error occurred`)
        }
      }
      
      console.error('Auth error details:', {
        message: error?.message,
        status: error?.status,
        code: error?.code,
        details: error
      })
      
      // Handle specific PKCE error
      if (error?.message?.includes('code verifier')) {
        console.error('PKCE code verifier issue detected. This usually means the OAuth flow was interrupted or cookies were cleared.')
        return NextResponse.redirect(`${baseUrl}/auth/signin?error=Authentication session expired. Please try signing in again.`)
      }
      
      return NextResponse.redirect(`${baseUrl}/auth/signin?error=${encodeURIComponent(error?.message || 'Authentication failed')}`)
    } catch (error) {
      console.error('Callback error:', error)
      return NextResponse.redirect(`${baseUrl}/auth/signin?error=An unexpected error occurred`)
    }
  }

  return NextResponse.redirect(`${baseUrl}/auth/signin?error=No code provided`)
}

// Helper function to extract profile image URL from different social providers
function getProfileImageUrl(user: any): string | null {
  const provider = user.app_metadata.provider;
  
  switch (provider) {
    case 'google':
      return user.user_metadata.avatar_url || user.user_metadata.picture;
    
    case 'linkedin_oidc':
    case 'linkedin':
      // LinkedIn provides picture in user_metadata
      return user.user_metadata.picture || user.user_metadata.avatar_url;
    
    case 'github':
      return user.user_metadata.avatar_url;
    
    case 'facebook':
      return user.user_metadata.picture?.data?.url || user.user_metadata.avatar_url;
    
    case 'twitter':
      return user.user_metadata.profile_image_url || user.user_metadata.avatar_url;
    
    default:
      // Fallback to common fields
      return user.user_metadata.avatar_url || user.user_metadata.picture || null;
  }
}
