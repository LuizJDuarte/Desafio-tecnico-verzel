import { Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { AppConfig } from '../../config/app-config';

/**
 * Pseudônimo público de um licitante DENTRO de um lote: HMAC-SHA256(segredo, lote + usuário).
 *
 * - Estável no lote: os lances da mesma pessoa aparecem com o mesmo apelido no histórico.
 * - Não reversível sem o segredo: não dá para descobrir nome, e-mail ou id a partir dele.
 * - Muda de um lote para outro: impede cruzar o comportamento de alguém entre leilões.
 * - Verificável pelo servidor: a auditoria recalcula o HMAC e detecta troca do licitante real no banco.
 */
@Injectable()
export class PseudonymService {
  constructor(private readonly config: AppConfig) {}

  aliasFor(lotId: string, userId: string): string {
    return createHmac('sha256', this.config.audit.pseudonymSecret)
      .update(`arremate-lot-alias/v1:${lotId}:${userId}`, 'utf8')
      .digest('hex')
      .slice(0, 6)
      .toUpperCase();
  }
}
