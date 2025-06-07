import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  try {
    const { folderId, originalName, storageName, size, mimeType } = await request.json();
    
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

    // Verify that the folder belongs to the user
    const folder = await prisma.folder.findUnique({
      where: { id: folderId, userId: dbUser.id }
    });

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found or access denied' }, { status: 404 });
    }

    // Create file record in database
    const file = await prisma.file.create({
      data: {
        folderId,
        originalName,
        storageName,
        size: BigInt(size),
        mimeType,
      }
    });

    return NextResponse.json({
      ...file,
      size: file.size.toString() // Convert BigInt to string for JSON
    });
  } catch (error) {
    console.error('Error creating file record:', error);
    return NextResponse.json({ error: 'Failed to create file record' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');
    
    if (!folderId) {
      return NextResponse.json({ error: 'Folder ID required' }, { status: 400 });
    }

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

    // Verify that the folder belongs to the user
    const folder = await prisma.folder.findUnique({
      where: { id: folderId, userId: dbUser.id }
    });

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found or access denied' }, { status: 404 });
    }

    // Fix overfetching - only select required fields
    const files = await prisma.file.findMany({
      where: { folderId },
      select: {
        id: true,
        originalName: true,
        storageName: true,
        size: true,
        mimeType: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'asc' }
    });

    return NextResponse.json(files.map((file: any) => ({
      ...file,  
      size: file.size.toString() // Convert BigInt to string for JSON
    })));
  } catch (error) {
    console.error('Error fetching files:', error);
    return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('id');
    const storageName = searchParams.get('storageName');
    
    if (!fileId && !storageName) {
      return NextResponse.json({ error: 'File ID or storage name required' }, { status: 400 });
    }

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

    // Get file info before deletion to verify ownership and for storage cleanup
    let fileToDelete;
    if (fileId) {
      fileToDelete = await prisma.file.findUnique({
        where: { id: fileId },
        include: { Folder: true }
      });
    } else if (storageName) {
      fileToDelete = await prisma.file.findUnique({
        where: { storageName: storageName },
        include: { Folder: true }
      });
    }

    if (!fileToDelete) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Verify file belongs to user
    if (fileToDelete.Folder.userId !== dbUser.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Delete file record from database first
    await prisma.file.delete({
      where: { id: fileToDelete.id }
    });

    // Delete from storage - using simplified path structure
    const storagePath = `${user.id}/${fileToDelete.storageName}`;
    const { error: storageError } = await supabase
      .storage
      .from('documents')
      .remove([storagePath]);

    if (storageError) {
      console.error('Error deleting file from storage:', storageError);
      // Don't fail the operation since DB record is already deleted
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { id, storageName, originalName, newStorageName } = await request.json();
    
    if (!id && !storageName) {
      return NextResponse.json({ error: 'File ID or storage name required' }, { status: 400 });
    }

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

    // Get file info to verify ownership
    let fileToUpdate;
    if (id) {
      fileToUpdate = await prisma.file.findUnique({
        where: { id },
        include: { Folder: true }
      });
    } else if (storageName) {
      fileToUpdate = await prisma.file.findUnique({
        where: { storageName },
        include: { Folder: true }
      });
    }

    if (!fileToUpdate) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Verify file belongs to user
    if (fileToUpdate.Folder.userId !== dbUser.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Prepare update data
    const updateData: any = { originalName };
    if (newStorageName) {
      updateData.storageName = newStorageName;
    }

    // Update file in database
    const file = await prisma.file.update({
      where: { id: fileToUpdate.id },
      data: updateData
    });

    return NextResponse.json({
      ...file,
      size: file.size.toString() // Convert BigInt to string for JSON
    });
  } catch (error) {
    console.error('Error updating file:', error);
    return NextResponse.json({ error: 'Failed to update file' }, { status: 500 });
  }
} 