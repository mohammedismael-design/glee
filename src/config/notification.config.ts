import { registerAs } from '@nestjs/config';

export default registerAs('notification', () => ({
  email: {
    fromName: process.env.EMAIL_FROM_NAME || 'Glee',
    fromAddress: process.env.EMAIL_FROM_ADDRESS || 'noreply@glee.com',
    smtpHost: process.env.SMTP_HOST,
    smtpPort: parseInt(process.env.SMTP_PORT, 10) || 587,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpSecure: process.env.SMTP_SECURE === 'true',
  },
  sms: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_FROM_NUMBER,
  },
  push: {
    fcmServerKey: process.env.FCM_SERVER_KEY,
  },
}));
