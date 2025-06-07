import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');
    
    if (!fileId) {
      return NextResponse.json({ error: 'File ID is required' }, { status: 400 });
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

    // Get file info and verify ownership
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { Folder: true }
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
  } catch (error) {
    console.error('Error downloading file:', error);
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
  }
} 