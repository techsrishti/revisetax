import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { uploadFile, deleteFile, getSignedDownloadUrl } from '@/utils/s3-client';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { supabaseUserId: user.id }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found in database' }, { status: 404 });
    }

    // If profile image is stored in S3, generate a signed URL
    let profileImageUrl = dbUser.profileImage;
    if (profileImageUrl && profileImageUrl.startsWith('s3://')) {
      // Extract S3 key from the URL
      const s3Key = profileImageUrl.replace('s3://', '');
      try {
        profileImageUrl = await getSignedDownloadUrl(s3Key, 3600); // 1 hour expiry
      } catch (error) {
        console.error('Error generating signed URL for profile image:', error);
        profileImageUrl = null;
      }
    }

    return NextResponse.json({ 
      success: true, 
      user: {
        ...dbUser,
        profileImage: profileImageUrl
      }
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user profile' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    let name: string | undefined;
    let email: string | undefined;
    let file: File | null = null;
    const updateData: any = {};

    const contentType = request.headers.get('content-type');
    
    if (contentType?.includes('multipart/form-data')) {
      // Handle FormData (file upload)
      const formData = await request.formData();
      name = formData.get('name') as string;
      email = formData.get('email') as string;
      file = formData.get('profileImage') as File;

      if (name) updateData.name = name;
      if (email) updateData.email = email;

      if (file) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          return NextResponse.json({ error: 'File size must be less than 2MB' }, { status: 400 });
        }

        // Get current user profile to check for existing image
        const dbUser = await prisma.user.findUnique({
          where: { supabaseUserId: user.id }
        });

        // If user has an existing profile image in S3, delete it
        if (dbUser?.profileImage && dbUser.profileImage.startsWith('s3://')) {
          try {
            const oldS3Key = dbUser.profileImage.replace('s3://', '');
            await deleteFile(oldS3Key);
          } catch (error) {
            console.error('Error deleting old profile image:', error);
          }
        }

        // Generate unique filename with proper extension
        const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const s3Key = `profile-images/${user.id}/${uuidv4()}.${fileExtension}`;

        // Convert file to buffer
        const fileBuffer = Buffer.from(await file.arrayBuffer());

        try {
          // Upload to S3 with metadata
          const metadata = {
            originalName: file.name,
            uploadedBy: user.id,
            uploadType: 'profile-image',
          };

          await uploadFile(s3Key, fileBuffer, file.type, metadata);

          // Store S3 key in database (with s3:// prefix for identification)
          updateData.profileImage = `s3://${s3Key}`;
        } catch (error) {
          console.error('S3 upload error:', error);
          return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
        }
      }
    } else {
      // Handle JSON data (regular updates)
      const { name: jsonName, email: jsonEmail, profileImage } = await request.json();
      name = jsonName;
      email = jsonEmail;
      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (profileImage) updateData.profileImage = profileImage;
    }

    // Update Supabase user data if name is provided
    if (name) {
      const { error: updateError } = await supabase.auth.updateUser({
        data: { full_name: name }
      });

      if (updateError) {
        console.error('Error updating Supabase user:', updateError);
        // Don't return error, continue with database update
      }
    }

    // Update user profile in database
    const updatedUser = await prisma.user.update({
      where: { supabaseUserId: user.id },
      data: updateData
    });

    // Generate signed URL for response if image is in S3
    let responseProfileImage = updatedUser.profileImage;
    if (responseProfileImage && responseProfileImage.startsWith('s3://')) {
      try {
        const s3Key = responseProfileImage.replace('s3://', '');
        responseProfileImage = await getSignedDownloadUrl(s3Key, 3600);
      } catch (error) {
        console.error('Error generating signed URL for response:', error);
        responseProfileImage = null;
      }
    }

    return NextResponse.json({ 
      success: true, 
      user: {
        ...updatedUser,
        profileImage: responseProfileImage
      },
      message: 'Profile updated successfully'
    });

  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
} 