import { IsNumber, IsString, IsOptional, IsDateString, Min, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateTicketTierDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  totalQuantity: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  earlyBirdLimit?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  earlyBirdPrice?: number;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  earlyBirdEndsAt?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;
}
