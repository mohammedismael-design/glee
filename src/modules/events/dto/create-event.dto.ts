import {
  IsString, IsOptional, IsDateString, IsUUID, IsNotEmpty, IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PublishStatus } from '@prisma/client';

export class CreateEventDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({ example: '2024-12-31T22:00:00Z' })
  @IsDateString()
  startTime: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  venueId?: string;
}
