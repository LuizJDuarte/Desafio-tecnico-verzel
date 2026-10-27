import { Injectable } from '@nestjs/common';
import {
  BidDto,
  computeLotPhase,
  LotDetailDto,
  LotImageDto,
  LotSummaryDto,
  minimumNextBidCents,
} from '@arremate/shared';
import type { BidEntity, LotEntity } from '../../database/entities';
import { PseudonymService } from '../audit/pseudonym.service';

/** Colunas necessárias para montar um card de lote (evita carregar snapshot, assinaturas etc.). */
export const LOT_SUMMARY_COLUMNS: Array<keyof LotEntity> = [
  'id',
  'number',
  'title',
  'artist',
  'imageId',
  'imageRemoteUrl',
  'imageLqip',
  'imageAlt',
  'state',
  'startsAt',
  'endsAt',
  'originalEndsAt',
  'startingPriceCents',
  'minIncrementCents',
  'currentPriceCents',
  'bidCount',
  'leaderId',
  'winnerId',
  'finalPriceCents',
  'sellerId',
  'createdAt',
];

@Injectable()
export class LotMapper {
  constructor(private readonly pseudonyms: PseudonymService) {}

  image(lot: Pick<LotEntity, 'imageId' | 'imageRemoteUrl' | 'imageLqip' | 'imageAlt'>): LotImageDto {
    return {
      url: lot.imageId ? `/api/images/${lot.imageId}` : lot.imageRemoteUrl,
      lqip: lot.imageLqip,
      alt: lot.imageAlt,
      stored: lot.imageId !== null,
    };
  }

  summary(lot: LotEntity, now: Date): LotSummaryDto {
    const settled = lot.state === 'SETTLED';
    return {
      id: lot.id,
      number: lot.number,
      title: lot.title,
      artist: lot.artist,
      image: this.image(lot),
      phase: computeLotPhase(lot, now),
      startsAt: lot.startsAt.toISOString(),
      endsAt: lot.endsAt.toISOString(),
      startingPriceCents: lot.startingPriceCents,
      minIncrementCents: lot.minIncrementCents,
      currentPriceCents: lot.currentPriceCents,
      minNextBidCents: minimumNextBidCents(lot),
      bidCount: lot.bidCount,
      leaderAlias: lot.leaderId ? this.pseudonyms.aliasFor(lot.id, lot.leaderId) : null,
      finalPriceCents: settled ? lot.finalPriceCents : null,
      hasWinner: settled && lot.winnerId !== null,
      extended: lot.endsAt.getTime() > lot.originalEndsAt.getTime(),
    };
  }

  detail(lot: LotEntity, sellerName: string, now: Date): LotDetailDto {
    return {
      ...this.summary(lot, now),
      state: lot.state,
      description: lot.description,
      attributes: lot.attributes ?? [],
      source: {
        provider: 'artic',
        providerName: 'Art Institute of Chicago',
        externalId: lot.externalId,
        url: lot.itemSnapshot?.sourceUrl ?? `https://www.artic.edu/artworks/${lot.externalId}`,
      },
      seller: { name: sellerName },
      originalEndsAt: lot.originalEndsAt.toISOString(),
      antiSniping: {
        windowSeconds: Math.round(lot.antiSnipingWindowMs / 1000),
        extensionSeconds: Math.round(lot.antiSnipingExtensionMs / 1000),
      },
      cancelledAt: lot.cancelledAt?.toISOString() ?? null,
      cancelReason: lot.cancelReason,
      settledAt: lot.settledAt?.toISOString() ?? null,
      createdAt: lot.createdAt.toISOString(),
    };
  }

  bid(bid: BidEntity, previousEndsAt: Date): BidDto {
    return {
      seq: bid.seq,
      bidderAlias: bid.bidderAlias,
      amountCents: bid.amountCents,
      createdAt: bid.createdAt.toISOString(),
      endsAtAfter: bid.endsAtAfter.toISOString(),
      extended: bid.endsAtAfter.getTime() > previousEndsAt.getTime(),
      hash: bid.hash,
    };
  }
}
