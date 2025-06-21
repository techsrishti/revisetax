import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get the current session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error('Session error:', sessionError);
      return NextResponse.json({ error: 'Session error: ' + sessionError.message }, { status: 401 });
    }
    if (!session) {
      return NextResponse.json({ error: 'No session found' }, { status: 401 });
    }

    // Get user metadata from Supabase
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.error('User error:', userError);
      return NextResponse.json({ error: 'User error: ' + userError.message }, { status: 401 });
    }
    if (!user || !user.email) {
      return NextResponse.json({ error: 'User not found or email missing' }, { status: 404 });
    }

    // Verify user is an admin
    const userEmail = user.email.toLowerCase();
    const isAdmin = userEmail.includes('admin') || userEmail.endsWith('@revisetax.com');
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized: User is not an admin' }, { status: 403 });
    }

    // Get admin from database
    const admin = await prisma.admin.findFirst({
      where: {
        OR: [
          { authId: user.id },
          { email: user.email }
        ]
      }
    });

    if (!admin) {
      return NextResponse.json({ error: 'Admin not found in database' }, { status: 404 });
    }

    return NextResponse.json({ 
      success: true, 
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        authId: admin.authId
      }
    });
  } catch (error) {
    console.error('Error getting admin details:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get admin details' },
      { status: 500 }
    );
  }
} 