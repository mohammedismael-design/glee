import {
  IsString, IsOptional, IsBoolean, IsNumber, Min, IsInt, IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateTableDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isVip?: boolean;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  attributes?: any;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  minimumSpend?: number;
}
