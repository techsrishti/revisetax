import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { prisma } from '@/lib/prisma';
import { getFileStream } from '@/utils/s3-client';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    // Get the userId from query params (for serving other users' profile images if needed)
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');
    
    // Default to current user if no userId specified
    const userId = targetUserId || user.id;

    const dbUser = await prisma.user.findUnique({
      where: { supabaseUserId: userId }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user has a profile image stored in S3
    if (!dbUser.profileImage || !dbUser.profileImage.startsWith('s3://')) {
      return NextResponse.json({ error: 'No profile image found' }, { status: 404 });
    }

    // Extract S3 key from the stored path
    const s3Key = dbUser.profileImage.replace('s3://', '');

    try {
      // Get the file stream from S3
      const fileStream = await getFileStream(s3Key);
      
      if (!fileStream) {
        return NextResponse.json({ error: 'Image not found' }, { status: 404 });
      }

      // Convert the stream to a buffer
      const chunks: Buffer[] = [];
      
      if (fileStream instanceof ReadableStream) {
        const reader = fileStream.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(Buffer.from(value));
          }
        } finally {
          reader.releaseLock();
        }
      } else {
        // Handle Node.js Readable stream
        const stream = fileStream as any;
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk));
        }
      }

      const buffer = Buffer.concat(chunks);

      // Determine content type based on file extension
      const fileExtension = s3Key.split('.').pop()?.toLowerCase();
      let contentType = 'image/jpeg'; // default
      
      switch (fileExtension) {
        case 'png':
          contentType = 'image/png';
          break;
        case 'gif':
          contentType = 'image/gif';
          break;
        case 'webp':
          contentType = 'image/webp';
          break;
        case 'svg':
          contentType = 'image/svg+xml';
          break;
        default:
          contentType = 'image/jpeg';
      }

      // Return the image with appropriate headers
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=3600', // Cache for 1 hour but keep private
          'Content-Length': buffer.length.toString(),
        },
      });

    } catch (error) {
      console.error('Error fetching profile image from S3:', error);
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in profile image route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 