import { IsNumber, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PurchaseTicketDto {
  @ApiProperty()
  @IsString()
  ticketTierId: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiProperty({ description: 'Idempotency key to prevent duplicate purchases' })
  @IsString()
  idempotencyKey: string;

  @ApiProperty({ enum: ['stripe', 'paypal'], default: 'stripe' })
  @IsString()
  paymentProvider: string;
}
