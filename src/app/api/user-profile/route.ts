import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/prisma';

const BUCKET_NAME = 'test';
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user profile from database
    const userProfile = await prisma.user.findUnique({
      where: { supabaseUserId: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        profileImage: true,
        provider: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!userProfile) {
      return NextResponse.json({ error: 'User not found in database' }, { status: 404 });
    }

    // Remove +91 from phone number if it exists
    if (userProfile.phoneNumber && userProfile.phoneNumber.startsWith('+91')) {
      userProfile.phoneNumber = userProfile.phoneNumber.substring(3);
    }

    return NextResponse.json({ 
      success: true, 
      user: userProfile
    });

  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if the request is form data or JSON
    let updateData: any = {
      updatedAt: new Date(),
    };

    let name: string | null = null;
    let email: string | null = null;

    if (request.headers.get('content-type')?.includes('multipart/form-data')) {
      // Handle form data (file upload)
      const formData = await request.formData();
      name = formData.get('name') as string;
      email = formData.get('email') as string;
      const phoneNumber = formData.get('phoneNumber') as string;
      const file = formData.get('file') as File | null;

      if (name) updateData.name = name;
      if (email) updateData.email = email;
      if (phoneNumber) updateData.phoneNumber = phoneNumber;

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

        // If user has an existing profile image, delete it
        if (dbUser?.profileImage) {
          try {
            const oldImagePath = dbUser.profileImage.split('/').slice(-2).join('/');
            await supabase.storage
              .from(BUCKET_NAME)
              .remove([oldImagePath]);
          } catch (error) {
            console.error('Error deleting old profile image:', error);
          }
        }

        // Generate unique filename with proper extension
        const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `${user.id}/${uuidv4()}.${fileExtension}`;

        // Convert file to ArrayBuffer
        const fileBuffer = await file.arrayBuffer();

        // Create bucket if it doesn't exist
        try {
          const { data: buckets } = await supabase.storage.listBuckets();
          if (!buckets?.find(b => b.name === BUCKET_NAME)) {
            await supabase.storage.createBucket(BUCKET_NAME, {
              public: true,
              allowedMimeTypes: ['image/*'],
              fileSizeLimit: MAX_FILE_SIZE
            });
          }
        } catch (error) {
          console.error('Error checking/creating bucket:', error);
        }

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(fileName, fileBuffer, {
            contentType: file.type,
            upsert: true
          });

        if (error) {
          console.error('Storage upload error:', error);
          return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
        }

        // Get the public URL
        const { data: publicUrlData } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(fileName);

        updateData.profileImage = publicUrlData.publicUrl;
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

    return NextResponse.json({ 
      success: true, 
      user: updatedUser,
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