import { Module } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import winston from 'winston';

@Module({
  imports: [
    WinstonModule.forRoot({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
      defaultMeta: {
        service: 'simple-load-testing-backend',
      },
      transports: [new winston.transports.Console()],
    }),
  ],
  exports: [WinstonModule],
})
export class LoggerModule {}

