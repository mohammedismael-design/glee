import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  provider: process.env.STORAGE_PROVIDER || 'cloudinary', // cloudinary | s3
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  s3: {
    bucket: process.env.AWS_S3_BUCKET,
    region: process.env.AWS_REGION || 'eu-west-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
  maxFileSizeBytes: parseInt(process.env.UPLOAD_MAX_SIZE_BYTES, 10) || 5 * 1024 * 1024,
  allowedMimeTypes: (process.env.UPLOAD_ALLOWED_TYPES || 'image/jpeg,image/png,image/webp').split(','),
  watermarkEnabled: process.env.WATERMARK_ENABLED === 'true',
  watermarkImagePath: process.env.WATERMARK_IMAGE_PATH,
  minResolutions: {
    flyer: { width: 800, height: 600 },
    heroBanner: { width: 1920, height: 1080 },
    gallery: { width: 800, height: 600 },
    menuItem: { width: 500, height: 500 },
  },
}));
