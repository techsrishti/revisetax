import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
    }

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

    // Verify user is an admin (you can adjust this logic based on your needs)
    const userEmail = user.email.toLowerCase();
    const isAdmin = userEmail.includes('admin') || userEmail.endsWith('@revisetax.com');
    if (!isAdmin) {
      return NextResponse.json({ error: 'Unauthorized: User is not an admin' }, { status: 403 });
    }

    // Create or update admin in the database
    const admin = await prisma.admin.upsert({
      where: {
        authId: user.id,
      },
      update: {
        email: user.email,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      },
      create: {
        authId: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.email.split('@')[0] || 'Admin',
        lastLoginAt: new Date(),
      },
    });

    // Create or update admin session
    const adminSession = await prisma.adminSession.upsert({
      where: {
        socketId: session.user.id,
      },
      update: {
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        adminId: admin.id,
        socketId: session.user.id,
        isActive: true,
      },
    });

    return NextResponse.json({ 
      success: true, 
      admin,
      adminSession 
    });
  } catch (error) {
    console.error('Error managing admin data:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to manage admin data' },
      { status: 500 }
    );
  }
} 