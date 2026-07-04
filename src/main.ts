import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { ConfigService } from '@nestjs/config';
import * as moment from 'moment-timezone';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import * as express from 'express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { AllExceptionsFilter } from './middleware';
import { CustomLoggerService } from './lib/loggger/logger.service';

function buildServerUrl(value: string | undefined, fallback: string): string {
  if (!value?.trim()) return fallback;
  const trimmed = value.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function buildCorsOriginChecker(configService: ConfigService) {
  const extras = (configService.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const platformUrl = configService.get<string>('PLATFORM_URL')?.trim();
  if (platformUrl) {
    try {
      extras.push(
        platformUrl.includes('://') ? platformUrl : `https://${platformUrl}`,
      );
    } catch {
      // ignore invalid PLATFORM_URL
    }
  }

  const productionUrl = configService.get<string>('PRODUCTION_URL')?.trim();
  const developmentUrl = configService.get<string>('DEVELOPMENT_URL')?.trim();
  for (const value of [productionUrl, developmentUrl]) {
    if (!value) continue;
    extras.push(buildServerUrl(value, value));
  }

  const exact = new Set(extras.map((o) => o.replace(/\/$/, '')));

  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) => {
    // Same-origin / server-to-server / curl
    if (!origin) {
      callback(null, true);
      return;
    }

    if (
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
      exact.has(origin.replace(/\/$/, ''))
    ) {
      callback(null, true);
      return;
    }

    callback(null, false);
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);
  const productionUrl = configService.get<string>('PRODUCTION_URL');
  const developmentUrl = configService.get<string>('DEVELOPMENT_URL');
  const platform = configService.get<string>('PLATFORM_NAME');
  const logger = app.get(CustomLoggerService);
  const apiKeyEnabled = !!configService.get<string>('API_KEY');
  const domainChatRaw = configService.get<string>('DOMAIN_CHAT');
  const domainChatSet = domainChatRaw
    ? new Set(
        domainChatRaw
          .split(',')
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean),
      )
    : null;
  const unlimitedPrompts = !domainChatSet?.size;
  const authorName = configService.get<string>('AUTHOR_NAME');
  const jwtSecret = configService.get<string>('JWT_SECRET') ?? '';

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  const expressApp = app.getHttpAdapter().getInstance() as express.Application;
  expressApp.use(express.static('public'));

  app.setGlobalPrefix('v1');

  app.use(
    helmet({
      contentSecurityPolicy: false, // Scalar API docs require inline scripts
      crossOriginEmbedderPolicy: false,
    }),
  );

  moment.tz.setDefault('Africa/Lagos');

  expressApp.set('trust proxy', 1);

  app.useGlobalFilters(new AllExceptionsFilter(logger));

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 2000,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      statusCode: 429,
      message: 'Too many auth attempts. Try again later.',
    },
  });
  expressApp.use('/v1/auth/login', authLimiter);
  expressApp.use('/v1/auth/register', authLimiter);

  app.enableCors({
    origin: buildCorsOriginChecker(configService),
    credentials: true,
    optionsSuccessStatus: 200,
    methods: 'GET,PATCH,POST,PUT,DELETE,OPTIONS',
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-api-key',
      'x-webhook-secret',
    ],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      stopAtFirstError: true,
      transform: true,
      whitelist: false,
    }),
  );

  const swaggerOptions = new DocumentBuilder()
    .setTitle(`${platform} API`)
    .setDescription(`API Documentation for ${platform} API`)
    .setVersion('1.0.0')
    .addServer(`http://localhost:${port}`, 'Local environment')
    .addServer(
      buildServerUrl(developmentUrl, `http://localhost:${port}`),
      'Development environment',
    )
    .addServer(
      buildServerUrl(productionUrl, `http://localhost:${port}`),
      'Production environment',
    )
    .addBearerAuth(
      { type: 'http', scheme: 'Bearer', bearerFormat: 'JWT' },
      'Authorization',
    )
    .addTag('Server', 'Endpoint for Server functions')
    .addTag('Auth', 'Register, login, and current user')
    .addTag('Chat', 'Endpoint for Chat functions')
    .addTag('Agents', 'Multi-agent job workflows')
    .addTag('Profile', 'Master profile and filters')
    .addTag('Jobs', 'Discovered and manual job listings')
    .addTag('Applications', 'Application tracking and dashboard')
    .addTag('Emails', 'Inbox ingest and recruiter email classification')
    .addTag('Scheduler', 'Background discovery and inbox sync')
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerOptions);
  expressApp.get('/v1/docs-json', (_req, res) => res.json(swaggerDocument));
  SwaggerModule.setup('v1/swagger', app, swaggerDocument);
  expressApp.use(
    '/v1/docs',
    apiReference({
      spec: { url: '/v1/docs-json' },
      theme: 'default',
      pageTitle: `${platform} API`,
    }),
  );

  const aiModelRaw = configService.get<string>('AI_MODEL')?.trim();
  const aiModel =
    aiModelRaw && aiModelRaw.length > 0
      ? aiModelRaw
      : 'claude-sonnet-4-5-20250929';

  try {
    await app.listen(port);
    const baseUrl = `http://localhost:${port}`;
    console.log(`Server running at ${baseUrl}`);
    console.log(`AI model: ${aiModel}`);
    console.log(`Health: ${baseUrl}/v1/health`);
    console.log(`Dashboard: ${baseUrl}/dashboard.html`);
    console.log(
      `Scheduler: ${configService.get<string>('SCHEDULER_ENABLED') === 'false' ? 'disabled' : 'enabled (discovery every 6h, inbox every 2h)'}`,
    );
    console.log(`Scalar: ${baseUrl}/v1/docs`);
    console.log(
      `API Key Auth: ${apiKeyEnabled ? 'ENABLED (x-api-key header required)' : 'DISABLED'}`,
    );
    console.log(`Unlimited prompts: ${unlimitedPrompts}`);
    console.log(`Copyright: ${authorName ? 'enabled' : 'disabled'}`);
    if (
      !jwtSecret ||
      jwtSecret === 'dev-only-change-me' ||
      jwtSecret === 'thomos-dev-jwt-secret-change-in-production'
    ) {
      console.warn(
        'WARNING: JWT_SECRET is weak/default. Set a long random JWT_SECRET before production.',
      );
    }
  } catch (err) {
    console.error('Error starting server', err);
  }
}
bootstrap();
