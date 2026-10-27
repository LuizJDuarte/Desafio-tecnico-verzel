import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { computeLotPhase, ReceiptDto } from '@arremate/shared';
import { Clock } from '../../common/clock';
import { notFound } from '../../common/errors';
import { LotEntity, ReceiptEntity, UserEntity } from '../../database/entities';
import type { AuthUser } from '../auth/auth.types';
import { LotMapper } from './lot.mapper';

/**
 * Comprovante público (qualquer pessoa com o link vê). Identifica o arrematante só pelo pseudônimo
 * e traz hash + assinatura para conferência independente.
 */
@Injectable()
export class ReceiptsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly mapper: LotMapper,
    private readonly clock: Clock,
  ) {}

  async byCode(code: string, viewer?: AuthUser): Promise<ReceiptDto> {
    const receipt = await this.dataSource.getRepository(ReceiptEntity).findOneBy({ code });
    if (!receipt) throw notFound('Comprovante');
    const lot = await this.dataSource.getRepository(LotEntity).findOneBy({ id: receipt.lotId });
    if (!lot) throw notFound('Lote');
    const seller = await this.dataSource.getRepository(UserEntity).findOneBy({ id: lot.sellerId });
    const detail = this.mapper.detail(lot, seller?.name ?? 'Leiloeiro', this.clock.now());

    return {
      code: receipt.code,
      number: receipt.number,
      lot: {
        id: lot.id,
        number: lot.number,
        title: receipt.lotTitle,
        artist: lot.artist,
        image: this.mapper.image(lot),
        phase: computeLotPhase(lot, this.clock.now()),
        source: detail.source,
        attributes: detail.attributes,
      },
      sellerName: detail.seller.name,
      winnerAlias: receipt.winnerAlias,
      amountCents: receipt.amountCents,
      bidCount: receipt.bidCount,
      headHash: receipt.headHash,
      closedAt: receipt.closedAt.toISOString(),
      issuedAt: receipt.issuedAt.toISOString(),
      payloadHash: receipt.payloadHash,
      signature: receipt.signature,
      keyId: receipt.keyId,
      viewerIsWinner: viewer?.id === receipt.winnerId,
    };
  }
}
