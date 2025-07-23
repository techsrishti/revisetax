import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_REGION || !process.env.AWS_BUCKET_NAME) {
  throw new Error('Missing required AWS environment variables');
}

export const s3Client = new S3Client({
  region: 'ap-south-2', // Hardcoding the region to match your bucket
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: false, // Use virtual hosted-style URLs
});

export const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

// Generate a standardized S3 key for file storage
export function generateFileKey(userId: string, folderId: string, fileName: string): string {
  return `documents/users/${userId}/folders/${folderId}/${fileName}`;
}

export async function uploadFile(key: string, file: Buffer, contentType?: string, metadata?: any) {
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file,
    ContentType: contentType,
    Metadata: metadata ? Object.fromEntries(
      Object.entries(metadata).map(([k, v]) => [k, String(v)])
    ) : undefined,
  });

  try {
    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error('Error uploading file to S3:', error);
    throw error;
  }
}

// Get file stream from S3
export async function getFileStream(key: string) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  try {
    const response = await s3Client.send(command);
    return response.Body;
  } catch (error) {
    console.error('Error getting file stream from S3:', error);
    throw error;
  }
}

export async function getSignedDownloadUrl(key: string, expiresIn = 43200) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: `inline; filename="${key.split('/').pop()}"`,
    ResponseContentType: 'application/pdf'
  });

  try {
    return await getSignedUrl(s3Client, command, { 
      expiresIn,
      // Remove signableHeaders to use default AWS signing process
    });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    throw error;
  }
}

export async function deleteFile(key: string) {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  try {
    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error('Error deleting file from S3:', error);
    throw error;
  }
}

export async function listFiles(prefix?: string) {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
  });

  try {
    const response = await s3Client.send(command);
    return response.Contents || [];
  } catch (error) {
    console.error('Error listing files from S3:', error);
    throw error;
  }
}

// Helper function to clean up old profile images for a user
export async function cleanupOldProfileImages(userId: string, keepLatest = 1): Promise<void> {
  try {
    const prefix = `profile-images/${userId}/`;
    const objects = await listFiles(prefix);
    
    if (objects.length <= keepLatest) {
      return; // Nothing to clean up
    }

    // Sort by last modified date (newest first)
    const sortedObjects = objects.sort((a, b) => {
      const dateA = a.LastModified ? new Date(a.LastModified).getTime() : 0;
      const dateB = b.LastModified ? new Date(b.LastModified).getTime() : 0;
      return dateB - dateA;
    });

    // Delete old images (keep only the latest ones)
    const toDelete = sortedObjects.slice(keepLatest);
    for (const obj of toDelete) {
      if (obj.Key) {
        await deleteFile(obj.Key);
        console.log(`Cleaned up old profile image: ${obj.Key}`);
      }
    }
  } catch (error) {
    console.error('Error cleaning up old profile images:', error);
    // Don't throw error, just log it
  }
}

// Enhanced function to download image from URL and upload to S3 for any social provider
export async function downloadAndUploadImageToS3(imageUrl: string, userId: string, provider = 'unknown'): Promise<string | null> {
  try {
    // Download the image from the URL
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      console.error(`Failed to download image: ${response.status} ${response.statusText}`);
      return null;
    }

    // Get the image data as a buffer
    const imageBuffer = Buffer.from(await response.arrayBuffer());

    // Validate image size (max 5MB for profile images)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (imageBuffer.length > maxSize) {
      console.error(`Image too large: ${imageBuffer.length} bytes (max: ${maxSize})`);
      return null;
    }

    // Determine file extension from content type or URL
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    let fileExtension = 'jpg';
    
    if (contentType.includes('png')) fileExtension = 'png';
    else if (contentType.includes('gif')) fileExtension = 'gif';
    else if (contentType.includes('webp')) fileExtension = 'webp';
    else if (contentType.includes('svg')) fileExtension = 'svg';
    else if (contentType.includes('jpeg') || contentType.includes('jpg')) fileExtension = 'jpg';

    // Generate unique S3 key for the profile image with provider info
    const timestamp = Date.now();
    const s3Key = `profile-images/${userId}/${provider}-${timestamp}-${uuidv4()}.${fileExtension}`;

    // Upload to S3
    const metadata = {
      originalSource: `${provider}-oauth`,
      uploadedBy: userId,
      uploadType: `profile-image-${provider}`,
      downloadedFrom: imageUrl,
      contentType: contentType,
      uploadDate: new Date().toISOString(),
    };

    await uploadFile(s3Key, imageBuffer, contentType, metadata);

    console.log(`Successfully uploaded ${provider} profile image to S3:`, s3Key);

    // Clean up old profile images (keep only the latest 2)
    try {
      await cleanupOldProfileImages(userId, 2);
    } catch (cleanupError) {
      console.warn('Failed to cleanup old profile images:', cleanupError);
      // Don't fail the main operation
    }

    // Return the S3 key with prefix for database storage
    return `s3://${s3Key}`;
  } catch (error) {
    console.error(`Error downloading and uploading ${provider} profile image:`, error);
    return null;
  }
} 