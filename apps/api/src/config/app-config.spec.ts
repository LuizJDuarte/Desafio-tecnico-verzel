import { loadConfig } from './app-config';

describe('loadConfig', () => {
  it('usa padrões seguros para desenvolvimento', () => {
    const config = loadConfig({});
    expect(config.env).toBe('development');
    expect(config.auth.cookieSecure).toBe(false);
    expect(config.antiSniping).toEqual({ windowMs: 120_000, extensionMs: 120_000 });
    expect(config.catalog.provider).toBe('artic');
  });

  it('em produção exige os segredos (falha na inicialização, não no meio de um lance)', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    const config = loadConfig({
      NODE_ENV: 'production',
      JWT_SECRET: 'x'.repeat(32),
      AUDIT_SIGNING_SECRET: 'y'.repeat(32),
      PSEUDONYM_SECRET: 'z'.repeat(32),
    });
    expect(config.isProduction).toBe(true);
    expect(config.auth.cookieSecure).toBe(true);
    expect(config.trustProxy).toBe(true);
  });

  it('trata variável vazia (copiada do .env.example) como não definida', () => {
    const config = loadConfig({ JWT_SECRET: '', PORT: '', ARTIC_CONTACT: '', SEED_DEMO_DATA: '' });
    expect(config.port).toBe(3000);
    expect(config.auth.jwtSecret.length).toBeGreaterThanOrEqual(16);
    expect(config.catalog.contact).toBe('');
    expect(config.seedDemoData).toBe(false);
    expect(() => loadConfig({ NODE_ENV: 'production', JWT_SECRET: '' })).toThrow(/JWT_SECRET/);
  });

  it('valida tipos e lista origens permitidas', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    const config = loadConfig({ ALLOWED_ORIGINS: 'http://localhost:5173/, https://exemplo.com' });
    expect(config.allowedOrigins).toEqual(['http://localhost:5173', 'https://exemplo.com']);
  });
});
