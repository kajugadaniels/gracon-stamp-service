import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ThrottlerExceptionFilter } from './common/filters/throttler-exception.filter';
import { buildCorsConfig } from './common/security/cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('APP_PORT', 3003);
  const env = config.get<string>('APP_ENV', 'development');

  app.use(helmet());
  app.setGlobalPrefix('api/v1');
  // The stamp API may be reached from multiple frontend origins. The strict
  // allowlist is composed from FRONTEND_URL plus any comma-separated entries
  // in FRONTEND_URLS so the user/admin/documents apps can all call it.
  app.enableCors(
    buildCorsConfig(
      config.get<string>('FRONTEND_URL', 'http://localhost:4000'),
      config.get<string>('FRONTEND_URLS'),
    ),
  );

  app.useGlobalFilters(
    new GlobalExceptionFilter(),
    new ThrottlerExceptionFilter(),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (env !== 'production') {
    const doc = new DocumentBuilder()
      .setTitle('Gracon 360 — Stamp Service')
      .setDescription('Institutional digital stamp and certificate API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, doc),
    );
  }

  await app.listen(port);
  console.log(
    `[${env.toUpperCase()}] Stamp service on http://localhost:${port}/api/v1`,
  );
}

bootstrap();
