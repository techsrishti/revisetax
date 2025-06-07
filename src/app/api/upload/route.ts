import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
  try {
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
      where: { supabaseUserId: user.id }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found in database. Please complete registration first.' }, { status: 404 });
    }

    // Verify folder exists and belongs to user
    const folder = await prisma.folder.findUnique({
      where: { 
        id: folderId,
        userId: dbUser.id
      }
    });

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found or access denied' }, { status: 404 });
    }

    // Generate a unique storage name
    const storageName = `${uuidv4()}-${file.name}`;
    
    // Step 1: Create the file record in database first (per architecture)
    const fileRecord = await prisma.file.create({
      data: {
        folderId,
        originalName: file.name,
        storageName,
        size: BigInt(file.size),
        mimeType: file.type,
      }
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
        // If storage upload fails, delete the database record (rollback)
        await prisma.file.delete({
          where: { id: fileRecord.id }
        });
        
        console.error('Error uploading file to storage:', storageError);
        return NextResponse.json({ error: 'Failed to upload file to storage' }, { status: 500 });
      }

      return NextResponse.json({
        ...fileRecord,
        size: fileRecord.size.toString() // Convert BigInt to string for JSON
      });
    } catch (storageUploadError) {
      // If anything fails during storage upload, clean up the database record
      await prisma.file.delete({
        where: { id: fileRecord.id }
      });
      
      console.error('Error during file upload process:', storageUploadError);
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }
  } catch (error) {
    console.error('Error uploading file:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
} 