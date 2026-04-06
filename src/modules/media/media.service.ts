import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaEntityType } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import * as sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

type ResolutionKey = keyof ReturnType<MediaService['getMinResolutions']>;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    cloudinary.config({
      cloud_name: configService.get('storage.cloudinary.cloudName'),
      api_key: configService.get('storage.cloudinary.apiKey'),
      api_secret: configService.get('storage.cloudinary.apiSecret'),
    });
  }

  private getMinResolutions() {
    return this.configService.get<any>('storage.minResolutions');
  }

  async uploadImage(
    file: Express.Multer.File,
    entityType: MediaEntityType,
    entityId: string,
    uploadedById: string,
    imageType: 'flyer' | 'heroBanner' | 'gallery' | 'menuItem' = 'flyer',
  ) {
    // Validate MIME type
    const allowedTypes = this.configService.get<string[]>('storage.allowedMimeTypes', []);
    if (allowedTypes.length && !allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} is not allowed`);
    }

    // Validate file size
    const maxSize = this.configService.get<number>('storage.maxFileSizeBytes', 5 * 1024 * 1024);
    if (file.size > maxSize) {
      throw new BadRequestException(`File size exceeds ${maxSize / (1024 * 1024)}MB limit`);
    }

    // Validate resolution
    const metadata = await sharp(file.buffer).metadata();
    const minRes = this.getMinResolutions()?.[imageType];
    if (minRes && (metadata.width < minRes.width || metadata.height < minRes.height)) {
      throw new BadRequestException(
        `Image must be at least ${minRes.width}x${minRes.height}px for ${imageType}`,
      );
    }

    // Apply watermark if configured
    let processedBuffer = file.buffer;
    const watermarkEnabled = this.configService.get<boolean>('storage.watermarkEnabled', false);
    const watermarkPath = this.configService.get<string>('storage.watermarkImagePath');
    if (watermarkEnabled && watermarkPath) {
      processedBuffer = await this.applyWatermark(file.buffer, watermarkPath);
    }

    // Build naming convention: {entity}/{id}/{timestamp}_{uuid}.{ext}
    const ext = file.mimetype.split('/')[1].replace('jpeg', 'jpg');
    const timestamp = Date.now();
    const uid = uuidv4().replace(/-/g, '').substring(0, 12);
    const publicId = `${entityType.toLowerCase()}/${entityId}/${timestamp}_${uid}`;

    // Upload to Cloudinary
    const uploadResult = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          folder: entityType.toLowerCase(),
          resource_type: 'image',
          format: ext,
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (err, result) => (err ? reject(err) : resolve(result)),
      ).end(processedBuffer);
    });

    // Generate auto-crop preview
    const previewUrl = cloudinary.url(uploadResult.public_id, {
      width: 400,
      height: 300,
      crop: 'fill',
      quality: 'auto',
    });

    // Store in DB
    const media = await this.prisma.media.create({
      data: {
        entityType,
        entityId,
        url: uploadResult.secure_url,
        cdnUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        filename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        width: metadata.width,
        height: metadata.height,
        uploadedById,
      },
    });

    return { ...media, previewUrl };
  }

  async getFallbackImage(entityType: MediaEntityType) {
    const fallback = await this.prisma.media.findFirst({
      where: { entityType, isFallback: true },
    });
    return fallback?.url ?? `https://placehold.co/800x600?text=${entityType}`;
  }

  async listByEntity(entityType: MediaEntityType, entityId: string) {
    return this.prisma.media.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async delete(mediaId: string, actorId: string) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) return;
    if (media.publicId) {
      await cloudinary.uploader.destroy(media.publicId);
    }
    await this.prisma.media.delete({ where: { id: mediaId } });
  }

  private async applyWatermark(imageBuffer: Buffer, watermarkPath: string): Promise<Buffer> {
    return sharp(imageBuffer)
      .composite([{ input: watermarkPath, gravity: 'southeast', blend: 'over' }])
      .toBuffer();
  }
}
