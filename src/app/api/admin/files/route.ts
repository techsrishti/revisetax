import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { prisma } from '@/lib/prisma';
import { getSignedDownloadUrl } from '@/utils/s3-client';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    // Get the fileId from query params
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');
    
    if (!fileId) {
      return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
    }

    // Find the file in the database
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        originalName: true,
        storageName: true,
        mimeType: true,
        s3Key: true,
        size: true
      }
    });

    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    try {
      // Generate signed URL for download
      if (!file.s3Key) {
        return NextResponse.json({ error: 'File S3 key not found' }, { status: 404 });
      }
      
      const signedUrl = await getSignedDownloadUrl(file.s3Key, 43200); // 12 hour expiry
      
      return NextResponse.json({ 
        success: true,
        downloadUrl: signedUrl,
        fileName: file.originalName,
        fileSize: file.size?.toString() || '0',
        mimeType: file.mimeType
      });

    } catch (error) {
      console.error('Error generating signed URL:', error);
      return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in admin files route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 