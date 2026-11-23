import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { ENV, type Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use(helmet());
  // Browsers reach the API only through the web app's same-origin /api proxy, so no CORS is
  // enabled: cross-origin browser requests are refused by default.
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  app.enableShutdownHooks();

  const env = app.get<Env>(ENV);
  await app.listen(env.PORT);
}

await bootstrap();
