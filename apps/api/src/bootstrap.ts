import { HttpStatus, Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AppException } from './common/errors';
import { AppConfig } from './config/app-config';
import { ConfiguredIoAdapter } from './modules/realtime/configured-io.adapter';

const logger = new Logger('Bootstrap');

/**
 * Defesa extra contra CSRF (além do cookie SameSite=Lax): requisições que alteram estado e vêm de um
 * navegador precisam ter Origin igual ao próprio host ou a uma origem explicitamente liberada.
 */
function originCheck(config: AppConfig) {
  const allowed = new Set(config.allowedOrigins);
  return (req: Request, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin) return next(); // clientes que não são navegador (curl, testes, Swagger no mesmo host)
    if (allowed.has(origin)) return next();
    const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
    try {
      if (new URL(origin).host === host) return next();
    } catch {
      // origem malformada: cai na rejeição abaixo
    }
    res.status(403).json({
      statusCode: 403,
      code: 'ORIGIN_NOT_ALLOWED',
      message: 'Origem da requisição não permitida.',
    });
  };
}

function resolveWebDist(config: AppConfig): string | null {
  const candidate = config.webDistPath ?? resolve(__dirname, '..', '..', 'web', 'dist');
  return existsSync(join(candidate, 'index.html')) ? candidate : null;
}

/** Configuração HTTP compartilhada entre produção e testes de integração. */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  if (config.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'blob:', 'https://www.artic.edu', 'https://*.artic.edu'],
          'font-src': ["'self'", 'data:'],
          'connect-src': ["'self'", 'ws:', 'wss:'],
          'object-src': ["'none'"],
          'frame-ancestors': ["'none'"],
          // Só faz sentido quando o site é servido por HTTPS (Render). No Docker local, em
          // http://localhost, a diretiva quebraria o carregamento dos próprios arquivos.
          'upgrade-insecure-requests': config.auth.cookieSecure ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.use('/api', originCheck(config));
  if (config.allowedOrigins.length > 0) {
    app.enableCors({ origin: config.allowedOrigins, credentials: true });
  }

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        const messages = errors.flatMap((error) => Object.values(error.constraints ?? {}));
        return new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', messages[0] ?? 'Dados inválidos.', {
          errors: messages,
        });
      },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useWebSocketAdapter(new ConfiguredIoAdapter(app, config.allowedOrigins));

  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Arremate API')
        .setDescription(
          'Casa de leilões online: lotes a partir do Art Institute of Chicago, lances ao vivo, carteira com saldo comprometido, liquidação e histórico auditável. Autenticação por cookie httpOnly (faça POST /api/auth/login) ou Bearer token.',
        )
        .setVersion('1.0.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, { customSiteTitle: 'Arremate API' });
  }

  const webDist = resolveWebDist(config);
  if (webDist) {
    // Em produção o próprio Nest serve o front (uma única origem: sem CORS, cookie e WebSocket simples).
    const server = app.getHttpAdapter().getInstance() as express.Express;
    server.use(
      express.static(webDist, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${sep}assets${sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    server.get(/^(?!\/api(\/|$)|\/socket\.io(\/|$)).*/, (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(webDist, 'index.html'));
    });
    logger.log(`Servindo o front-end a partir de ${webDist}`);
  } else if (config.isProduction) {
    logger.warn('Build do front-end não encontrado: apenas a API será servida.');
  }

  app.enableShutdownHooks();
}
