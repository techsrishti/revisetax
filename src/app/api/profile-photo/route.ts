import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { prisma } from '@/lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import { uploadFile, deleteFile, getFileStream, downloadAndUploadImageToS3, cleanupOldProfileImages } from '@/utils/s3-client';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Helper function to extract profile image URL from different social providers
function getProfileImageUrl(user: any): string | null {
  const provider = user.app_metadata.provider;
  
  switch (provider) {
    case 'google':
      return user.user_metadata.avatar_url || user.user_metadata.picture;
    
    case 'linkedin_oidc':
    case 'linkedin':
      return user.user_metadata.picture || user.user_metadata.avatar_url;
    
    case 'github':
      return user.user_metadata.avatar_url;
    
    case 'facebook':
      return user.user_metadata.picture?.data?.url || user.user_metadata.avatar_url;
    
    case 'twitter':
      return user.user_metadata.profile_image_url || user.user_metadata.avatar_url;
    
    default:
      return user.user_metadata.avatar_url || user.user_metadata.picture || null;
  }
}

// GET: Serve profile photo with optional social sync check
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');
    const autoSync = searchParams.get('autoSync') === 'true';
    const action = searchParams.get('action'); // 'serve', 'info', or 'sync-check'
    
    // Default to current user if no userId specified
    const userId = targetUserId || user.id;

    const dbUser = await prisma.user.findUnique({
      where: { supabaseUserId: userId }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Handle different actions
    if (action === 'info') {
      // Return profile photo info without serving the actual image
      const hasProfileImage = dbUser.profileImage && dbUser.profileImage.startsWith('s3://');
      const hasSocialProvider = user.app_metadata.provider && 
                              user.app_metadata.provider !== 'email' &&
                              user.app_metadata.provider !== 'phone';
      const socialProfileImageUrl = getProfileImageUrl(user);
      
      return NextResponse.json({
        hasProfileImage,
        hasSocialProvider,
        provider: user.app_metadata.provider,
        socialImageAvailable: !!socialProfileImageUrl,
        canSync: hasSocialProvider && socialProfileImageUrl && !hasProfileImage,
        profileImagePath: hasProfileImage ? `/api/profile-photo?userId=${userId}` : null,
        lastUpdated: dbUser.updatedAt
      });
    }

    if (action === 'sync-check') {
      // Check if auto-sync is needed and perform if requested
      const hasSocialProvider = user.app_metadata.provider && 
                              user.app_metadata.provider !== 'email' &&
                              user.app_metadata.provider !== 'phone';
      const hasProfileImage = dbUser.profileImage && dbUser.profileImage.startsWith('s3://');
      const socialProfileImageUrl = getProfileImageUrl(user);
      const needsSync = hasSocialProvider && !hasProfileImage && socialProfileImageUrl;

      if (needsSync && autoSync) {
        try {
          console.log(`Auto-syncing ${user.app_metadata.provider} profile picture for user:`, userId);
          const s3ProfileImagePath = await downloadAndUploadImageToS3(
            socialProfileImageUrl, 
            userId, 
            user.app_metadata.provider
          );
          
          if (s3ProfileImagePath) {
            await prisma.user.update({
              where: { id: dbUser.id },
              data: { 
                profileImage: s3ProfileImagePath,
                updatedAt: new Date()
              }
            });

            return NextResponse.json({
              success: true,
              synced: true,
              message: `Successfully synced ${user.app_metadata.provider} profile picture`,
              profileImagePath: `/api/profile-photo?userId=${userId}`
            });
          }
        } catch (syncError) {
          console.error('Auto-sync failed:', syncError);
        }
      }

      return NextResponse.json({
        needsSync,
        synced: false,
        provider: user.app_metadata.provider,
        hasProfileImage,
        socialImageAvailable: !!socialProfileImageUrl
      });
    }

    // Default action: serve the profile image
    if (!dbUser.profileImage || !dbUser.profileImage.startsWith('s3://')) {
      // No profile image found, try auto-sync if enabled
      if (autoSync) {
        const hasSocialProvider = user.app_metadata.provider && 
                                user.app_metadata.provider !== 'email' &&
                                user.app_metadata.provider !== 'phone';
        const socialProfileImageUrl = getProfileImageUrl(user);
        
        if (hasSocialProvider && socialProfileImageUrl) {
          try {
            console.log(`Auto-syncing profile picture for user without image:`, userId);
            const s3ProfileImagePath = await downloadAndUploadImageToS3(
              socialProfileImageUrl, 
              userId, 
              user.app_metadata.provider
            );
            
            if (s3ProfileImagePath) {
              await prisma.user.update({
                where: { id: dbUser.id },
                data: { 
                  profileImage: s3ProfileImagePath,
                  updatedAt: new Date()
                }
              });

              // Now serve the newly synced image
              const s3Key = s3ProfileImagePath.replace('s3://', '');
              const fileStream = await getFileStream(s3Key);
              
              if (fileStream) {
                return await serveImageFromStream(fileStream, s3Key);
              }
            }
          } catch (syncError) {
            console.error('Auto-sync during serve failed:', syncError);
          }
        }
      }
      
      return NextResponse.json({ error: 'No profile image found' }, { status: 404 });
    }

    // Extract S3 key from the stored path and serve the image
    const s3Key = dbUser.profileImage.replace('s3://', '');
    
    try {
      const fileStream = await getFileStream(s3Key);
      
      if (!fileStream) {
        return NextResponse.json({ error: 'Image not found in storage' }, { status: 404 });
      }

      return await serveImageFromStream(fileStream, s3Key);

    } catch (error) {
      console.error('Error fetching profile image from S3:', error);
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in profile photo route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Upload new profile photo or sync from social
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action'); // 'upload' or 'sync'

    const dbUser = await prisma.user.findUnique({
      where: { supabaseUserId: user.id }
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (action === 'sync') {
      // Sync from social provider
      const provider = user.app_metadata.provider;
      const profileImageUrl = getProfileImageUrl(user);

      if (!provider || provider === 'email' || provider === 'phone') {
        return NextResponse.json({ error: 'No social provider found' }, { status: 400 });
      }

      if (!profileImageUrl) {
        return NextResponse.json({ error: 'No profile image URL found in social account' }, { status: 400 });
      }

      try {
        console.log(`Manually syncing ${provider} profile picture:`, profileImageUrl);
        const s3ProfileImagePath = await downloadAndUploadImageToS3(
          profileImageUrl, 
          user.id, 
          provider
        );
        
        if (s3ProfileImagePath) {
          await prisma.user.update({
            where: { id: dbUser.id },
            data: { 
              profileImage: s3ProfileImagePath,
              updatedAt: new Date()
            }
          });

          return NextResponse.json({ 
            success: true, 
            message: `Successfully synced ${provider} profile picture`,
            profileImagePath: `/api/profile-photo?userId=${user.id}`,
            provider
          });
        } else {
          return NextResponse.json({ 
            error: `Failed to download/upload ${provider} profile picture` 
          }, { status: 500 });
        }
      } catch (syncError) {
        console.error(`Error syncing ${provider} profile picture:`, syncError);
        return NextResponse.json({ 
          error: `Failed to sync ${provider} profile picture` 
        }, { status: 500 });
      }
    }

    // Default action: upload new profile photo
    const contentType = request.headers.get('content-type');
    
    if (!contentType?.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'Invalid content type. Use multipart/form-data for file uploads' }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get('profilePhoto') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size must be less than 5MB' }, { status: 400 });
    }

    // Generate unique filename with proper extension
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const timestamp = Date.now();
    const s3Key = `profile-images/${user.id}/upload-${timestamp}-${uuidv4()}.${fileExtension}`;

    // Convert file to buffer
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    try {
      // Upload to S3 with metadata
      const metadata = {
        originalName: file.name,
        uploadedBy: user.id,
        uploadType: 'profile-image-upload',
        uploadDate: new Date().toISOString(),
      };

      await uploadFile(s3Key, fileBuffer, file.type, metadata);

      // Update database
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { 
          profileImage: `s3://${s3Key}`,
          updatedAt: new Date()
        }
      });

      // Clean up old profile images
      try {
        await cleanupOldProfileImages(user.id, 2);
      } catch (cleanupError) {
        console.warn('Failed to cleanup old profile images:', cleanupError);
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Profile photo uploaded successfully',
        profileImagePath: `/api/profile-photo?userId=${user.id}`,
        fileName: file.name
      });

    } catch (error) {
      console.error('Upload error:', error);
      return NextResponse.json({ error: 'Failed to upload profile photo' }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in profile photo POST route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE: Remove profile photo
export async function DELETE(request: NextRequest) {
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
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!dbUser.profileImage || !dbUser.profileImage.startsWith('s3://')) {
      return NextResponse.json({ error: 'No profile image to delete' }, { status: 404 });
    }

    try {
      // Delete from S3
      const s3Key = dbUser.profileImage.replace('s3://', '');
      await deleteFile(s3Key);

      // Update database
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { 
          profileImage: null,
          updatedAt: new Date()
        }
      });

      return NextResponse.json({ 
        success: true, 
        message: 'Profile photo deleted successfully'
      });

    } catch (error) {
      console.error('Error deleting profile photo:', error);
      return NextResponse.json({ error: 'Failed to delete profile photo' }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in profile photo DELETE route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to serve image from stream
async function serveImageFromStream(fileStream: any, s3Key: string): Promise<NextResponse> {
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
      'Cache-Control': 'private, max-age=3600', // Cache for 1 hour
      'Content-Length': buffer.length.toString(),
      'ETag': `"${s3Key.split('/').pop()}"`, // Simple ETag based on filename
    },
  });
} 