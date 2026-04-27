import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: true,
      credentials: false,
    },
  });

  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Basic HTTP access logs (method/path/status/latency)
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
      logger.log('http_request', {
        method: req.method,
        path: req.originalUrl ?? req.url,
        statusCode: res.statusCode,
        durationMs: Date.now() - start,
        contentLength: res.getHeader('content-length'),
        userAgent: req.headers['user-agent'],
      });
    });
    next();
  });

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

