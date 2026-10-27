import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Conveniência para desenvolvimento local: carrega o arquivo .env da raiz do repositório, se existir.
 * Variáveis já definidas no ambiente continuam valendo (em produção o .env nem existe: o Render
 * injeta as variáveis direto no processo). Importado só pelos pontos de entrada, nunca pelos testes.
 */
const envFile = resolve(__dirname, '..', '..', '..', '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
