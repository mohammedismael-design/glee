import {
  IsString, IsNumber, IsOptional, Min, IsEnum, IsObject, IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReservationType } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateBookingDto {
  @ApiProperty()
  @IsString()
  tableId: string;

  @ApiProperty()
  @IsString()
  timeSlotId: string;

  @ApiProperty({ enum: ReservationType, default: ReservationType.STANDARD_TABLE })
  @IsEnum(ReservationType)
  reservationType: ReservationType;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  guestCount: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  customerNotes?: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  preferences?: any;

  @ApiProperty({ description: 'Idempotency key to prevent duplicate bookings' })
  @IsString()
  idempotencyKey: string;

  @ApiPropertyOptional({ type: [Object] })
  @IsArray()
  @IsOptional()
  items?: Array<{ menuItemId: string; quantity: number }>;
}
