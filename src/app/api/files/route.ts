import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { uploadFile, getSignedDownloadUrl, deleteFile, generateFileKey, getFileStream } from '@/utils/s3-client';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folderId = formData.get('folderId') as string;
    
    if (!file || !folderId) {
      return NextResponse.json({ error: 'File and folder ID are required' }, { status: 400 });
    }

    // Validate file size (e.g., 10MB limit)
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxFileSize) {
      return NextResponse.json({ error: 'File size too large. Maximum size is 10MB.' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'File type not allowed. Please upload PDF, JPG, PNG, DOC, DOCX, XLS, or XLSX files.' }, { status: 400 });
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
      return NextResponse.json({ error: 'User not found in database. Please complete registration first.' }, { status: 404 });
    }

    // Verify folder exists and belongs to user
    const folder = await prisma.folder.findUnique({
      where: { id: folderId, userId: dbUser.id },
      select: { id: true }
    });

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found or access denied' }, { status: 404 });
    }

    const storageName = `${uuidv4()}-${file.name}`;
    const s3Key = generateFileKey(dbUser.id, folderId, storageName);
    
    // Create file record and increment folder count atomically
    const fileRecord = await prisma.$transaction(async (tx) => {
      const newFile = await tx.file.create({
        data: {
          folderId,
          originalName: file.name,
          storageName,
          size: BigInt(file.size),
          mimeType: file.type,
          s3Key, // Store S3 key in database
        }
      });

      await tx.folder.update({
        where: { id: folderId },
        data: { fileCount: { increment: 1 } }
      });

      return newFile;
    });

    try {
      // Convert file to buffer for S3 upload
      const fileArrayBuffer = await file.arrayBuffer();
      const fileBuffer = Buffer.from(fileArrayBuffer);
      
      // Upload to S3 with metadata
      const metadata = {
        originalName: file.name,
        uploadedBy: dbUser.id,
        folderId: folderId,
      };

      await uploadFile(s3Key, fileBuffer, file.type, metadata);

      return NextResponse.json({
        ...fileRecord,
        size: fileRecord.size.toString()
      });
    } catch (storageUploadError) {
      // Rollback database changes if S3 upload fails
      await prisma.$transaction(async (tx) => {
        await tx.file.delete({ where: { id: fileRecord.id } });
        await tx.folder.update({
          where: { id: folderId },
          data: { fileCount: { decrement: 1 } }
        });
      });
      
      console.error('Error during file upload process:', storageUploadError);
      return NextResponse.json({ error: 'Failed to upload file to storage' }, { status: 500 });
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

    const dbUser = await prisma.user.findUnique({
      where: { supabaseUserId: user.id },
      select: { id: true }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found in database. Please complete registration first.' }, { status: 404 });
    }

    // Handle file download
    if (fileId) {
      const signedUrl = searchParams.get('signedUrl'); // Check if signed URL is requested
      
      const file = await prisma.file.findUnique({
        where: { id: fileId },
        select: {
          id: true,
          originalName: true,
          storageName: true,
          mimeType: true,
          s3Key: true,
          folderId: true,
          size: true,
          Folder: { select: { userId: true } }
        }
      });

      if (!file) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }

      if (file.Folder.userId !== dbUser.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      const s3Key = file.s3Key || generateFileKey(dbUser.id, file.folderId, file.storageName);

      // If signed URL is requested, return JSON with signed URL
      if (signedUrl === 'true') {
        try {
          const downloadUrl = await getSignedDownloadUrl(s3Key, 43200); // 12 hour expiry
          
          return NextResponse.json({ 
            success: true,
            downloadUrl,
            fileName: file.originalName,
            fileSize: file.size.toString(),
            mimeType: file.mimeType
          });
        } catch (error) {
          console.error('Error generating signed URL:', error);
          return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
        }
      }

      try {
        // Get file stream from S3 for direct download
        const fileStream = await getFileStream(s3Key);

        if (!fileStream) {
          return NextResponse.json({ error: 'File not found in storage' }, { status: 404 });
        }

        // Convert AWS SDK stream to readable stream for Next.js response
        const chunks: Uint8Array[] = [];
        
        if (fileStream instanceof ReadableStream) {
          const reader = fileStream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
          }
        } else {
          // Handle Node.js Readable stream
          const nodeStream = fileStream as any;
          for await (const chunk of nodeStream) {
            chunks.push(chunk);
          }
        }
        
        const buffer = Buffer.concat(chunks);

        return new Response(buffer, {
          headers: {
            'Content-Type': file.mimeType,
            'Content-Disposition': `attachment; filename="${file.originalName}"`,
          },
        });
      } catch (error) {
        console.error('Error downloading file from S3:', error);
        return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
      }
    }

    // Handle file listing
    if (folderId) {
      // Verify folder belongs to user
      const folder = await prisma.folder.findUnique({
        where: { id: folderId, userId: dbUser.id },
        select: { id: true }
      });

      if (!folder) {
        return NextResponse.json({ error: 'Folder not found or access denied' }, { status: 404 });
      }

      const files = await prisma.file.findMany({
        where: { folderId },
        select: {
          id: true,
          originalName: true,
          size: true,
          mimeType: true,
          createdAt: true,
          folderId: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return NextResponse.json(files.map(file => ({
        ...file,
        size: file.size.toString()
      })));
    }

    // Get all files for the user
    const files = await prisma.file.findMany({
      where: {
        Folder: {
          userId: dbUser.id
        }
      },
      select: {
        id: true,
        originalName: true,
        size: true,
        mimeType: true,
        createdAt: true,
        folderId: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(files.map(file => ({
      ...file,
      size: file.size.toString()
    })));

  } catch (error) {
    console.error('Error fetching files:', error);
    return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');
    const storageName = searchParams.get('storageName');
    
    if (!fileId && !storageName) {
      return NextResponse.json({ error: 'File ID or storage name required' }, { status: 400 });
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
      return NextResponse.json({ error: 'User not found in database. Please complete registration first.' }, { status: 404 });
    }

    // Get file info before deletion
    let fileToDelete;
    if (fileId) {
      fileToDelete = await prisma.file.findUnique({
        where: { id: fileId },
        select: {
          id: true,
          storageName: true,
          folderId: true,
          s3Key: true,
          Folder: { select: { userId: true } }
        }
      });
    } else if (storageName) {
      fileToDelete = await prisma.file.findUnique({
        where: { storageName: storageName },
        select: {
          id: true,
          storageName: true,
          folderId: true,
          s3Key: true,
          Folder: { select: { userId: true } }
        }
      });
    }

    if (!fileToDelete) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    if (fileToDelete.Folder.userId !== dbUser.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Delete file record and decrement folder count atomically
    await prisma.$transaction(async (tx) => {
      await tx.file.delete({ where: { id: fileToDelete.id } });
      await tx.folder.update({
        where: { id: fileToDelete.folderId },
        data: { fileCount: { decrement: 1 } }
      });
    });

    // Delete from S3
    try {
      const s3Key = fileToDelete.s3Key || generateFileKey(dbUser.id, fileToDelete.folderId, fileToDelete.storageName);
      await deleteFile(s3Key);
    } catch (storageError) {
      console.error('Error deleting file from S3:', storageError);
      // Don't fail the request if S3 deletion fails, as the DB record is already deleted
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
          Folder: { select: { userId: true } }
        }
      });
    } else if (storageName) {
      fileToUpdate = await prisma.file.findUnique({
        where: { storageName },
        select: {
          id: true,
          Folder: { select: { userId: true } }
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

    const file = await prisma.file.update({
      where: { id: fileToUpdate.id },
      data: updateData
    });

    return NextResponse.json({
      ...file,
      size: file.size.toString()
    });
  } catch (error) {
    console.error('Error updating file:', error);
    return NextResponse.json({ error: 'Failed to update file' }, { status: 500 });
  }
} 