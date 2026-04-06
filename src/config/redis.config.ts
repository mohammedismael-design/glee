import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  inventoryHoldTtlSeconds: parseInt(process.env.INVENTORY_HOLD_TTL_SECONDS, 10) || 600,
}));
