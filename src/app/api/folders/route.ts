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
      where: { supabaseUserId: user.id }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found in database. Please complete registration first.' }, { status: 404 });
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
      where: { supabaseUserId: user.id }
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
      where: { supabaseUserId: user.id }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get all files in the folder before deletion (for storage cleanup)
    const folderFiles = await prisma.file.findMany({
      where: { folderId: folderId },
      select: { id: true, storageName: true }
    });

    // Use database transaction to ensure atomicity
    await prisma.$transaction(async (tx) => {
      // Step 1: Delete all files from database first
      if (folderFiles.length > 0) {
        await tx.file.deleteMany({
          where: { folderId: folderId }
        });
      }

      // Step 2: Delete folder from database
      await tx.folder.delete({
        where: { 
          id: folderId,
          userId: dbUser.id  
        }
      });
    });

    // Step 3: Clean up files from storage (after successful DB deletion)
    if (folderFiles.length > 0) {
      const filesToDelete = folderFiles.map(file => `${user.id}/${file.storageName}`);
      
      const { error: storageError } = await supabase
        .storage
        .from('documents')
        .remove(filesToDelete);
      
      if (storageError) {
        console.error('Error deleting files from storage:', storageError);
        // Don't fail the operation since DB records are already deleted
        console.warn('Some files could not be deleted from storage, but folder deletion was successful');
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting folder:', error);
    return NextResponse.json({ error: 'Failed to delete folder' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('id');
    const { name } = await request.json();
    
    if (!folderId) {
      return NextResponse.json({ error: 'Folder ID required' }, { status: 400 });
    }

    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'Folder name required' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { supabaseUserId: user.id }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update folder name
    const updatedFolder = await prisma.folder.update({
      where: { 
        id: folderId,
        userId: dbUser.id // Ensure user owns this folder
      },
      data: {
        name: name.trim(),
        updatedAt: new Date()
      }
    });

    return NextResponse.json(updatedFolder);
  } catch (error) {
    console.error('Error updating folder:', error);
    return NextResponse.json({ error: 'Failed to update folder' }, { status: 500 });
  }
} 