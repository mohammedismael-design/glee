import { Module } from '@nestjs/common';
import { InventoryCleanupJob } from './inventory-cleanup.job';

@Module({
  providers: [InventoryCleanupJob],
})
export class JobsModule {}
