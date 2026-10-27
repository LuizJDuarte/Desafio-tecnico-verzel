/**
 * Testes de integração: sobem a aplicação Nest de verdade contra um PostgreSQL real.
 * Usa DATABASE_URL_TEST (padrão: postgres://arremate:arremate@localhost:5432/arremate_test).
 * @type {import('jest').Config}
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/integration/**/*.int-spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@arremate/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  globalSetup: '<rootDir>/test/integration/global-setup.ts',
  testTimeout: 30000,
  maxWorkers: 1,
};
