import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user exists in database
    const dbUser = await prisma.user.findUnique({
      where: { supabaseUserId: user.id },
      select: { id: true }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found in database. Please complete registration first.' }, { status: 404 });
    }

    // Check if folder with same name already exists for this user
    const existingFolder = await prisma.folder.findFirst({
      where: {
        name,
        userId: dbUser.id
      }
    });

    if (existingFolder) {
      return NextResponse.json({ error: 'A folder with this name already exists' }, { status: 409 });
    }

    // Create folder in database
    const folder = await prisma.folder.create({
      data: {
        name,
        userId: dbUser.id,
      }
    });

    return NextResponse.json(folder);
  } catch (error) {
    console.error('Error creating folder:', error);
    return NextResponse.json({ error: 'Failed to create folder' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { supabaseUserId: user.id },
      select: { id: true }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found in database. Please complete registration first.' }, { status: 404 });
    }

    const folders = await prisma.folder.findMany({
      where: { userId: dbUser.id },
      select: {
        id: true,
        name: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'asc' }
    });

    return NextResponse.json(folders);
  } catch (error) {
    console.error('Error fetching folders:', error);
    return NextResponse.json({ error: 'Failed to fetch folders' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('id');
    
    if (!folderId) {
      return NextResponse.json({ error: 'Folder ID required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { supabaseUserId: user.id },
      select: { id: true }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if folder exists and belongs to the user
    const folder = await prisma.folder.findFirst({
      where: {
        id: folderId,
        userId: dbUser.id
      },
      select: { id: true }
    });

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found or you do not have permission to delete it' }, { status: 404 });
    }

    // Check if folder has any files
    const fileCount = await prisma.file.count({
      where: { folderId: folderId }
    });

    // Prevent deletion if folder contains files
    if (fileCount > 0) {
      return NextResponse.json({ 
        error: 'This folder cannot be deleted since there are files inside this folder. Empty this folder completely to delete this folder.',
        fileCount: fileCount
      }, { status: 400 });
    }

    // Delete empty folder from database
    await prisma.folder.delete({
      where: { 
        id: folderId,
        userId: dbUser.id  
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting folder:', error);
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
  }
}

