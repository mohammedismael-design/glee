import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  corsOrigins: process.env.CORS_ORIGINS || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  apiUrl: process.env.API_URL || 'http://localhost:4000',
  sentryDsn: process.env.SENTRY_DSN,
  logLevel: process.env.LOG_LEVEL || 'info',
  gdprRetentionDays: parseInt(process.env.GDPR_RETENTION_DAYS, 10) || 30,
}));
