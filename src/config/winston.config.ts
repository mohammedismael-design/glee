import * as winston from 'winston';
import 'winston-daily-rotate-file';

const { combine, timestamp, json, colorize, simple } = winston.format;

const fileTransport = new winston.transports.DailyRotateFile({
  dirname: 'logs',
  filename: 'glee-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  format: combine(timestamp(), json()),
});

const errorFileTransport = new winston.transports.DailyRotateFile({
  dirname: 'logs',
  filename: 'glee-error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d',
  format: combine(timestamp(), json()),
});

export const winstonConfig: winston.LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
  format: combine(timestamp(), json()),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        simple(),
      ),
    }),
    fileTransport,
    errorFileTransport,
  ],
};
