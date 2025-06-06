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

    const files = await prisma.file.findMany({
      where: { folderId },
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

    // Delete file record from database
    if (fileId) {
      await prisma.file.delete({
        where: { id: fileId }
      });
    } else if (storageName) {
      await prisma.file.delete({
        where: { storageName: storageName }
      });
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

    // Prepare update data
    const updateData: any = { originalName };
    if (newStorageName) {
      updateData.storageName = newStorageName;
    }

    // Update file in database
    let file;
    if (id) {
      file = await prisma.file.update({
        where: { id },
        data: updateData
      });
    } else if (storageName) {
      file = await prisma.file.update({
        where: { storageName },
        data: updateData
      });
    }

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...file,
      size: file.size.toString() // Convert BigInt to string for JSON
    });
  } catch (error) {
    console.error('Error updating file:', error);
    return NextResponse.json({ error: 'Failed to update file' }, { status: 500 });
  }
} 