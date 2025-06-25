import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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

export async function getSignedDownloadUrl(key: string, expiresIn = 3600) {
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