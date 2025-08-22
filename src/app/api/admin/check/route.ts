import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: NextRequest) {
  try {
    let user;
    
    // Check if Authorization header is provided (for middleware usage)
    const authHeader = request.headers.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const userId = authHeader.substring(7)
      // For middleware, we'll trust the user ID since middleware already verified the session
      user = { id: userId }
    } else {
      // Regular API usage - verify authentication
      const supabase = await createClient()
      const { data: { user: sessionUser }, error: authError } = await supabase.auth.getUser()

      if (authError) {
        console.error('Auth error:', authError)
        return NextResponse.json({ isAdmin: false, error: 'Authentication failed' }, { status: 401 })
      }
      
      if (!sessionUser) {
        return NextResponse.json({ isAdmin: false, error: 'No user session found' }, { status: 401 })
      }
      
      user = sessionUser
    }

    // Check if user is admin
    const admin = await prisma.admin.findFirst({
      where: {
        authId: user.id
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    })

    if (!admin) {
      return NextResponse.json({ isAdmin: false }, { status: 200 })
    }

    return NextResponse.json({ 
      isAdmin: true, 
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email
      }
    })
  } catch (error) {
    console.error('Error checking admin status:', error)
    return NextResponse.json({ isAdmin: false, error: 'Internal server error' }, { status: 500 })
  }
} 