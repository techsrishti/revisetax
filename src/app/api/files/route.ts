import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
  try {
    // Handle file upload with FormData (replaces /api/upload)
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folderId = formData.get('folderId') as string;
    
    if (!file || !folderId) {
      return NextResponse.json({ error: 'File and folder ID are required' }, { status: 400 });
    }

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

    // Verify folder exists and belongs to user
    const folder = await prisma.folder.findUnique({
      where: { 
        id: folderId,
        userId: dbUser.id
      },
      select: { id: true }
    });

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found or access denied' }, { status: 404 });
    }

    // Generate a unique storage name
    const storageName = `${uuidv4()}-${file.name}`;
    
    // Step 1: Create the file record and increment folder count atomically
    const fileRecord = await prisma.$transaction(async (tx) => {
      const newFile = await tx.file.create({
        data: {
          folderId,
          originalName: file.name,
          storageName,
          size: BigInt(file.size),
          mimeType: file.type,
        }
      });

      await tx.folder.update({
        where: { id: folderId },
        data: { fileCount: { increment: 1 } }
      });

      return newFile;
    });

    try {
      // Step 2: Upload to Supabase Storage using simplified structure
      // No folder hierarchy needed since DB tracks relationships
      const filePath = `${user.id}/${storageName}`;
      
      const fileArrayBuffer = await file.arrayBuffer();
      const fileBuffer = new Uint8Array(fileArrayBuffer);
      
      const { error: storageError } = await supabase
        .storage
        .from('documents')
        .upload(filePath, fileBuffer, { upsert: true });

      if (storageError) {
        // If storage upload fails, rollback database changes atomically
        await prisma.$transaction(async (tx) => {
          await tx.file.delete({
            where: { id: fileRecord.id }
          });
          
          await tx.folder.update({
            where: { id: folderId },
            data: { fileCount: { decrement: 1 } }
          });
        });
        
        console.error('Error uploading file to storage:', storageError);
        return NextResponse.json({ error: 'Failed to upload file to storage' }, { status: 500 });
      }

      return NextResponse.json({
        ...fileRecord,
        size: fileRecord.size.toString() // Convert BigInt to string for JSON
      });
    } catch (storageUploadError) {
      // If anything fails during storage upload, rollback database changes atomically
      await prisma.$transaction(async (tx) => {
        await tx.file.delete({
          where: { id: fileRecord.id }
        });
        
        await tx.folder.update({
          where: { id: folderId },
          data: { fileCount: { decrement: 1 } }
        });
      });
      
      console.error('Error during file upload process:', storageUploadError);
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get('folderId');
    const fileId = searchParams.get('fileId');
    
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

    // Handle file download
    if (fileId) {
      // Get file info and verify ownership
      const file = await prisma.file.findUnique({
        where: { id: fileId },
        select: {
          id: true,
          originalName: true,
          storageName: true,
          mimeType: true,
          Folder: {
            select: { userId: true }
          }
        }
      });

      if (!file) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      // Verify file belongs to user
      if (file.Folder.userId !== dbUser.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Download from storage using simplified path structure
      const filePath = `${user.id}/${file.storageName}`;
      const { data, error } = await supabase
        .storage
        .from('documents')
        .download(filePath);

      if (error) {
        console.error('Error downloading file from storage:', error);
        return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
      }

      // Return the file as a blob
      return new Response(data, {
        headers: {
          'Content-Type': file.mimeType,
          'Content-Disposition': `attachment; filename="${file.originalName}"`,
        },
      });
    }

    // Handle file listing
    if (folderId) {
      // Verify that the folder belongs to the user
      const folder = await prisma.folder.findUnique({
        where: { id: folderId, userId: dbUser.id },
        select: { id: true }
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
    }

    // Neither folderId nor fileId provided
    return NextResponse.json({ error: 'Either folderId (for listing) or fileId (for download) is required' }, { status: 400 });

  } catch (error) {
    console.error('Error in files GET request:', error);
    return NextResponse.json({ error: 'Failed to process request' }, { status: 500 });
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
      where: { supabaseUserId: user.id },
      select: { id: true }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found in database. Please complete registration first.' }, { status: 404 });
    }

    // Get file info before deletion to verify ownership and for storage cleanup
    let fileToDelete;
    if (fileId) {
      fileToDelete = await prisma.file.findUnique({
        where: { id: fileId },
        select: {
          id: true,
          storageName: true,
          folderId: true,
          Folder: {
            select: { userId: true }
          }
        }
      });
    } else if (storageName) {
      fileToDelete = await prisma.file.findUnique({
        where: { storageName: storageName },
        select: {
          id: true,
          storageName: true,
          folderId: true,
          Folder: {
            select: { userId: true }
          }
        }
      });
    }

    if (!fileToDelete) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Verify file belongs to user
    if (fileToDelete.Folder.userId !== dbUser.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Delete file record and decrement folder count atomically
    await prisma.$transaction(async (tx) => {
      await tx.file.delete({
        where: { id: fileToDelete.id }
      });

      await tx.folder.update({
        where: { id: fileToDelete.folderId },
        data: { fileCount: { decrement: 1 } }
      });
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
      where: { supabaseUserId: user.id },
      select: { id: true }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found in database. Please complete registration first.' }, { status: 404 });
    }

    // Get file info to verify ownership
    let fileToUpdate;
    if (id) {
      fileToUpdate = await prisma.file.findUnique({
        where: { id },
        select: {
          id: true,
          Folder: {
            select: { userId: true }
          }
        }
      });
    } else if (storageName) {
      fileToUpdate = await prisma.file.findUnique({
        where: { storageName },
        select: {
          id: true,
          Folder: {
            select: { userId: true }
          }
        }
      });
    }

    if (!fileToUpdate) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

     if (fileToUpdate.Folder.userId !== dbUser.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

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