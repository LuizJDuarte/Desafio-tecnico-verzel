import { z } from 'zod';

const booleanFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase()),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1).default('postgres://arremate:arremate@localhost:5432/arremate'),
  DATABASE_SSL: z.enum(['auto', 'true', 'false']).default('auto'),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET precisa de pelo menos 16 caracteres').optional(),
  JWT_EXPIRES_IN_HOURS: z.coerce
    .number()
    .positive()
    .default(24 * 7),
  AUDIT_SIGNING_SECRET: z.string().min(16, 'AUDIT_SIGNING_SECRET precisa de pelo menos 16 caracteres').optional(),
  PSEUDONYM_SECRET: z.string().min(16, 'PSEUDONYM_SECRET precisa de pelo menos 16 caracteres').optional(),
  COOKIE_SECURE: booleanFromEnv.optional(),
  TRUST_PROXY: booleanFromEnv.optional(),
  ALLOWED_ORIGINS: z.string().default(''),
  WEB_DIST_PATH: z.string().optional(),
  SEED_DEMO_DATA: booleanFromEnv.default(false),
  CATALOG_PROVIDER: z.enum(['artic', 'fake']).default('artic'),
  ARTIC_API_URL: z.string().url().default('https://api.artic.edu/api/v1'),
  ARTIC_CONTACT: z.string().trim().default(''),
  CATALOG_TIMEOUT_MS: z.coerce.number().int().positive().default(6000),
  IMAGE_DOWNLOAD_ENABLED: booleanFromEnv.default(true),
  ANTI_SNIPING_WINDOW_SECONDS: z.coerce.number().int().positive().default(120),
  ANTI_SNIPING_EXTENSION_SECONDS: z.coerce.number().int().positive().default(120),
  SCHEDULER_ENABLED: booleanFromEnv.default(true),
  RATE_LIMIT_ENABLED: booleanFromEnv.default(true),
  SWAGGER_ENABLED: booleanFromEnv.default(true),
});

export type NodeEnv = 'development' | 'test' | 'production';
export type CatalogProviderName = 'artic' | 'fake';

/**
 * Configuração tipada e validada na inicialização (fail fast): se algo obrigatório faltar em produção,
 * a aplicação nem sobe, em vez de falhar no meio de um lance.
 */
export class AppConfig {
  env!: NodeEnv;
  isProduction!: boolean;
  port!: number;
  database!: { url: string; ssl: 'auto' | boolean; poolMax: number };
  auth!: {
    jwtSecret: string;
    jwtExpiresInSeconds: number;
    cookieName: string;
    cookieSecure: boolean;
  };
  audit!: { signingSecret: string; pseudonymSecret: string };
  allowedOrigins!: string[];
  trustProxy!: boolean;
  webDistPath!: string | null;
  seedDemoData!: boolean;
  catalog!: {
    provider: CatalogProviderName;
    articApiUrl: string;
    contact: string;
    timeoutMs: number;
    imageDownloadEnabled: boolean;
  };
  antiSniping!: { windowMs: number; extensionMs: number };
  schedulerEnabled!: boolean;
  rateLimitEnabled!: boolean;
  swaggerEnabled!: boolean;
}

const DEV_SECRETS = {
  jwt: 'dev-only-jwt-secret-troque-em-producao',
  audit: 'dev-only-audit-signing-secret-troque-em-producao',
  pseudonym: 'dev-only-pseudonym-secret-troque-em-producao',
};

export function loadConfig(raw: NodeJS.ProcessEnv = process.env): AppConfig {
  // Variável vazia (ex.: "JWT_SECRET=" copiado do .env.example) conta como não definida e cai no padrão.
  const defined = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== undefined && value !== ''));
  const parsed = envSchema.safeParse(defined);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Configuração inválida -> ${problems.join('; ')}`);
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';

  const secret = (name: string, value: string | undefined, devFallback: string): string => {
    if (value) return value;
    if (isProduction) {
      throw new Error(`A variável de ambiente ${name} é obrigatória em produção.`);
    }
    return devFallback;
  };

  const config = new AppConfig();
  config.env = env.NODE_ENV;
  config.isProduction = isProduction;
  config.port = env.PORT;
  config.database = {
    url: env.DATABASE_URL,
    ssl: env.DATABASE_SSL === 'auto' ? 'auto' : env.DATABASE_SSL === 'true',
    poolMax: env.DATABASE_POOL_MAX,
  };
  config.auth = {
    jwtSecret: secret('JWT_SECRET', env.JWT_SECRET, DEV_SECRETS.jwt),
    jwtExpiresInSeconds: Math.round(env.JWT_EXPIRES_IN_HOURS * 3600),
    cookieName: 'arremate_session',
    cookieSecure: env.COOKIE_SECURE ?? isProduction,
  };
  config.audit = {
    signingSecret: secret('AUDIT_SIGNING_SECRET', env.AUDIT_SIGNING_SECRET, DEV_SECRETS.audit),
    pseudonymSecret: secret('PSEUDONYM_SECRET', env.PSEUDONYM_SECRET, DEV_SECRETS.pseudonym),
  };
  config.allowedOrigins = env.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
  config.trustProxy = env.TRUST_PROXY ?? isProduction;
  config.webDistPath = env.WEB_DIST_PATH ?? null;
  config.seedDemoData = env.SEED_DEMO_DATA;
  config.catalog = {
    provider: env.CATALOG_PROVIDER,
    articApiUrl: env.ARTIC_API_URL.replace(/\/$/, ''),
    contact: env.ARTIC_CONTACT,
    timeoutMs: env.CATALOG_TIMEOUT_MS,
    imageDownloadEnabled: env.IMAGE_DOWNLOAD_ENABLED,
  };
  config.antiSniping = {
    windowMs: env.ANTI_SNIPING_WINDOW_SECONDS * 1000,
    extensionMs: env.ANTI_SNIPING_EXTENSION_SECONDS * 1000,
  };
  config.schedulerEnabled = env.SCHEDULER_ENABLED;
  config.rateLimitEnabled = env.RATE_LIMIT_ENABLED;
  config.swaggerEnabled = env.SWAGGER_ENABLED;
  return config;
}
