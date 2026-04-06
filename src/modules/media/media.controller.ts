import {
  Controller, Post, Get, Delete, Param, UploadedFile, UseInterceptors,
  UseGuards, Query, Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { MediaEntityType, UserRole } from '@prisma/client';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { memoryStorage } from 'multer';

@ApiTags('media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'media', version: '1' })
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post(':entityType/:entityId/upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload image for an entity' })
  upload(
    @Param('entityType') entityType: MediaEntityType,
    @Param('entityId') entityId: string,
    @CurrentUser('id') uploadedById: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('imageType') imageType: 'flyer' | 'heroBanner' | 'gallery' | 'menuItem' = 'flyer',
  ) {
    return this.mediaService.uploadImage(file, entityType, entityId, uploadedById, imageType);
  }

  @Get(':entityType/:entityId')
  @ApiOperation({ summary: 'List media for an entity' })
  list(
    @Param('entityType') entityType: MediaEntityType,
    @Param('entityId') entityId: string,
  ) {
    return this.mediaService.listByEntity(entityType, entityId);
  }

  @Get(':entityType/fallback')
  @ApiOperation({ summary: 'Get fallback image URL for entity type' })
  fallback(@Param('entityType') entityType: MediaEntityType) {
    return this.mediaService.getFallbackImage(entityType);
  }

  @Delete(':mediaId')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.CONTENT_MANAGER, UserRole.VENDOR)
  @ApiOperation({ summary: 'Delete media asset' })
  delete(@Param('mediaId') mediaId: string, @CurrentUser('id') actorId: string) {
    return this.mediaService.delete(mediaId, actorId);
  }
}
