import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  AUDIT_SCHEME,
  AuditBundle,
  AuditIssue,
  AuditResponse,
  computeLotPhase,
  verifyAuditBundle,
  withAdditionalCheck,
} from '@arremate/shared';
import { Clock } from '../../common/clock';
import { notFound } from '../../common/errors';
import { BidEntity, LotEntity, ReceiptEntity } from '../../database/entities';
import { LotMapper } from '../auction/lot.mapper';
import { AuditSigner } from './audit-signer.service';
import { PseudonymService } from './pseudonym.service';

/**
 * Auditoria pública. Monta o pacote verificável (sem dados pessoais), roda o MESMO verificador que o
 * navegador roda e acrescenta checagens que exigem dados privados (o vínculo pseudônimo -> licitante).
 * Tudo é lido direto das tabelas, sem cache: se alguém mexer no banco, a próxima auditoria acusa.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly signer: AuditSigner,
    private readonly pseudonyms: PseudonymService,
    private readonly mapper: LotMapper,
    private readonly clock: Clock,
  ) {}

  async audit(lotId: string): Promise<AuditResponse> {
    const lot = await this.dataSource.getRepository(LotEntity).findOneBy({ id: lotId });
    if (!lot) throw notFound('Lote');
    const bids = await this.dataSource.getRepository(BidEntity).find({
      where: { lotId },
      order: { seq: 'ASC', createdAt: 'ASC' },
    });
    const receipt = await this.dataSource.getRepository(ReceiptEntity).findOneBy({ lotId });

    const bundle = this.buildBundle(lot, bids, receipt);
    const publicReport = await verifyAuditBundle(bundle, this.signer.crypto);

    const identityIssues: AuditIssue[] = [];
    for (const bid of bids) {
      if (bid.bidderAlias !== this.pseudonyms.aliasFor(lot.id, bid.bidderId)) {
        identityIssues.push({
          check: 'IDENTITIES',
          code: 'IDENTITY_BINDING_MISMATCH',
          seq: bid.seq,
          message: `O licitante real do lance #${bid.seq} foi trocado no banco: o pseudônimo registrado não corresponde mais a ele.`,
        });
      }
    }
    if (receipt && receipt.winnerAlias !== this.pseudonyms.aliasFor(lot.id, receipt.winnerId)) {
      identityIssues.push({
        check: 'IDENTITIES',
        code: 'IDENTITY_BINDING_MISMATCH',
        message: 'O arrematante registrado no comprovante foi trocado no banco.',
      });
    }
    if (lot.state === 'SETTLED' && lot.bidCount > 0 && lot.winnerId !== lot.leaderId) {
      identityIssues.push({
        check: 'IDENTITIES',
        code: 'IDENTITY_BINDING_MISMATCH',
        message: 'O vencedor registrado no lote não é o autor do último lance.',
      });
    }

    const report = withAdditionalCheck(
      publicReport,
      {
        id: 'IDENTITIES',
        detail:
          'Cada pseudônimo corresponde ao licitante real que deu o lance (checagem feita no servidor, sem expor quem é).',
      },
      identityIssues,
    );

    const now = this.clock.now();
    return {
      lot: {
        id: lot.id,
        number: lot.number,
        title: lot.title,
        artist: lot.artist,
        image: this.mapper.image(lot),
        phase: computeLotPhase(lot, now),
      },
      bundle,
      report,
      publicKey: this.signer.publicKeyDto(),
      verifiedAt: now.toISOString(),
    };
  }

  buildBundle(lot: LotEntity, bids: BidEntity[], receipt: ReceiptEntity | null): AuditBundle {
    return {
      scheme: AUDIT_SCHEME,
      lot: {
        ...this.signer.genesisFieldsOf(lot),
        state: lot.state,
        endsAt: lot.endsAt.toISOString(),
        bidCount: lot.bidCount,
        currentPriceCents: lot.currentPriceCents,
        leaderAlias: lot.leaderId ? this.pseudonyms.aliasFor(lot.id, lot.leaderId) : null,
        genesisHash: lot.genesisHash,
        genesisSignature: lot.genesisSignature,
        genesisKeyId: lot.genesisKeyId,
        headHash: lot.headHash,
        headSignature: lot.headSignature,
        headKeyId: lot.headKeyId,
      },
      bids: bids.map((bid) => ({
        lotId: bid.lotId,
        seq: bid.seq,
        bidderAlias: bid.bidderAlias,
        amountCents: bid.amountCents,
        createdAt: bid.createdAt.toISOString(),
        endsAtAfter: bid.endsAtAfter.toISOString(),
        prevHash: bid.prevHash,
        hash: bid.hash,
        signature: bid.signature,
        keyId: bid.keyId,
      })),
      receipt: receipt
        ? {
            code: receipt.code,
            number: receipt.number,
            lotId: receipt.lotId,
            lotTitle: receipt.lotTitle,
            winnerAlias: receipt.winnerAlias,
            amountCents: receipt.amountCents,
            bidCount: receipt.bidCount,
            headHash: receipt.headHash,
            closedAt: receipt.closedAt.toISOString(),
            issuedAt: receipt.issuedAt.toISOString(),
            payloadHash: receipt.payloadHash,
            signature: receipt.signature,
            keyId: receipt.keyId,
          }
        : null,
    };
  }
}
