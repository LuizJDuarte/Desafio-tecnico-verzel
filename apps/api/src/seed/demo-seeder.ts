import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock';
import { UserEntity } from '../database/entities';
import { BiddingService } from '../modules/auction/bidding.service';
import { LotsService } from '../modules/auction/lots.service';
import { SettlementScheduler } from '../modules/auction/settlement.scheduler';
import { SettlementService } from '../modules/auction/settlement.service';
import { AuthService } from '../modules/auth/auth.service';
import type { AuthUser } from '../modules/auth/auth.types';
import { ApiCacheService } from '../modules/catalog/api-cache.service';
import { mapArticArtwork } from '../modules/catalog/providers/artic.mapper';
import { ARTWORKS_SNAPSHOT } from '../modules/catalog/providers/artworks.snapshot';
import { WalletService } from '../modules/wallet/wallet.service';

export const DEMO_PASSWORD = 'arremate123';

export const DEMO_ACCOUNTS = {
  auctioneer: { name: 'Galeria Aurora Leilões', email: 'leiloeiro@example.com' },
  ana: { name: 'Ana Souza', email: 'ana@example.com' },
  bruno: { name: 'Bruno Lima', email: 'bruno@example.com' },
} as const;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface SeedSummary {
  lots: Record<string, string>;
}

/**
 * Dados de demonstração (pedidos no desafio): 1 leiloeiro, 2 licitantes e lotes em TODOS os estados,
 * incluindo lotes ao vivo com lances abertos. Tudo é criado pelos MESMOS serviços usados pela API
 * (com horários retroativos), então os históricos têm hashes e assinaturas válidos de verdade.
 * Um lote é adulterado de propósito via SQL para demonstrar a auditoria detectando a fraude.
 */
@Injectable()
export class DemoSeeder {
  private readonly logger = new Logger(DemoSeeder.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly auth: AuthService,
    private readonly wallets: WalletService,
    private readonly lots: LotsService,
    private readonly bidding: BiddingService,
    private readonly settlement: SettlementService,
    private readonly cache: ApiCacheService,
    private readonly scheduler: SettlementScheduler,
    private readonly clock: Clock,
  ) {}

  async seedIfEmpty(): Promise<boolean> {
    const users = await this.dataSource.getRepository(UserEntity).count();
    if (users > 0) {
      this.logger.log('Banco já possui dados: seed de demonstração ignorada.');
      return false;
    }
    await this.seed();
    return true;
  }

  async seed(): Promise<SeedSummary> {
    await this.scheduler.pause();
    try {
      return await this.createDemoData();
    } finally {
      this.scheduler.resume();
    }
  }

  private async createDemoData(): Promise<SeedSummary> {
    const base = this.clock.now().getTime();
    const at = (offsetMs: number) => new Date(base + offsetMs);
    const iso = (offsetMs: number) => at(offsetMs).toISOString();

    // Snapshot das obras no cache como "vencido": a seed tenta a API real primeiro (dados e imagem
    // atualizados) e, se ela estiver fora do ar, usa estes dados. O deploy nunca depende da API.
    for (const artwork of ARTWORKS_SNAPSHOT) {
      await this.cache.set(`artic:item:v1:${artwork.id}`, mapArticArtwork(artwork), new Date(0));
    }

    const seller = await this.auth.register({
      ...DEMO_ACCOUNTS.auctioneer,
      password: DEMO_PASSWORD,
      role: 'AUCTIONEER',
    });
    const anaUser = await this.auth.register({ ...DEMO_ACCOUNTS.ana, password: DEMO_PASSWORD, role: 'BIDDER' });
    const brunoUser = await this.auth.register({ ...DEMO_ACCOUNTS.bruno, password: DEMO_PASSWORD, role: 'BIDDER' });
    const ana: AuthUser = { id: anaUser.id, role: 'BIDDER' };
    const bruno: AuthUser = { id: brunoUser.id, role: 'BIDDER' };

    await this.wallets.deposit(ana.id, 500_000_00, at(-15 * DAY));
    await this.wallets.deposit(bruno.id, 500_000_00, at(-15 * DAY));

    const lots: Record<string, string> = {};

    // 1) Encerrado e arrematado, com prorrogação no último minuto (Ana vence).
    const grandeJatte = await this.lots.create(
      seller.id,
      {
        externalId: '27992',
        description: 'Obra-prima do pontilhismo. O último lance caiu no último minuto e prorrogou o encerramento.',
        startingPriceCents: 200_000_00,
        minIncrementCents: 5_000_00,
        startsAt: iso(-10 * DAY),
        endsAt: iso(-7 * DAY),
      },
      at(-10 * DAY - HOUR),
    );
    await this.bidding.placeBid(grandeJatte.id, ana, 200_000_00, at(-9 * DAY));
    await this.bidding.placeBid(grandeJatte.id, bruno, 210_000_00, at(-8 * DAY));
    await this.bidding.placeBid(grandeJatte.id, ana, 230_000_00, at(-7 * DAY - MINUTE));
    await this.settlement.settleLot(grandeJatte.id, at(-7 * DAY + 2 * MINUTE));
    lots.encerradoArrematado = grandeJatte.id;

    // 2) Encerrado sem lances (fecha sem vencedor).
    const selfPortrait = await this.lots.create(
      seller.id,
      {
        externalId: '80607',
        startingPriceCents: 300_000_00,
        minIncrementCents: 10_000_00,
        startsAt: iso(-6 * DAY),
        endsAt: iso(-4 * DAY),
      },
      at(-6 * DAY - HOUR),
    );
    await this.settlement.settleLot(selfPortrait.id, at(-4 * DAY + MINUTE));
    lots.encerradoSemLances = selfPortrait.id;

    // 3) Demonstração de adulteração: arrematado por Bruno; depois o lance #2 é alterado direto no banco.
    const moulin = await this.lots.create(
      seller.id,
      {
        externalId: '61128',
        description:
          'LOTE DE DEMONSTRAÇÃO DA AUDITORIA: depois do encerramento, o valor do lance #2 foi alterado diretamente no banco de dados, sem passar pela aplicação. Abra a auditoria deste lote para ver a adulteração sendo detectada.',
        startingPriceCents: 40_000_00,
        minIncrementCents: 2_500_00,
        startsAt: iso(-5 * DAY),
        endsAt: iso(-3 * DAY),
      },
      at(-5 * DAY - HOUR),
    );
    await this.bidding.placeBid(moulin.id, bruno, 40_000_00, at(-4 * DAY - 12 * HOUR));
    await this.bidding.placeBid(moulin.id, ana, 45_000_00, at(-4 * DAY));
    await this.bidding.placeBid(moulin.id, bruno, 50_000_00, at(-3 * DAY - 6 * HOUR));
    await this.settlement.settleLot(moulin.id, at(-3 * DAY + MINUTE));
    await this.dataSource.query(`UPDATE bids SET amount_cents = 4100000 WHERE lot_id = $1 AND seq = 2`, [moulin.id]);
    lots.demoAdulterado = moulin.id;

    // 4) Agendado e cancelado pelo leiloeiro (não aparece na vitrine).
    const childsBath = await this.lots.create(
      seller.id,
      {
        externalId: '111442',
        startingPriceCents: 90_000_00,
        minIncrementCents: 2_000_00,
        startsAt: iso(5 * DAY),
        endsAt: iso(15 * DAY),
      },
      at(-3 * DAY),
    );
    await this.lots.cancel(childsBath.id, seller.id, 'Obra retirada do leilão a pedido do comitente.', at(-2 * DAY));
    lots.cancelado = childsBath.id;

    // 5) Ao vivo com lances abertos: Ana lidera.
    const bedroom = await this.lots.create(
      seller.id,
      {
        externalId: '28560',
        startingPriceCents: 120_000_00,
        minIncrementCents: 5_000_00,
        startsAt: iso(-DAY),
        endsAt: iso(21 * DAY),
      },
      at(-DAY - 10 * MINUTE),
    );
    await this.bidding.placeBid(bedroom.id, bruno, 120_000_00, at(-20 * HOUR));
    await this.bidding.placeBid(bedroom.id, ana, 130_000_00, at(-3 * HOUR));
    lots.aoVivoAnaLidera = bedroom.id;

    // 6) Ao vivo com disputa acirrada: Bruno lidera (lote principal para testar).
    const lilies = await this.lots.create(
      seller.id,
      {
        externalId: '16568',
        description: 'Lote principal da demonstração: entre como Ana ou Bruno e dispute ao vivo.',
        startingPriceCents: 80_000_00,
        minIncrementCents: 2_500_00,
        startsAt: iso(-2 * HOUR),
        endsAt: iso(30 * DAY),
      },
      at(-2 * HOUR - 10 * MINUTE),
    );
    await this.bidding.placeBid(lilies.id, ana, 80_000_00, at(-110 * MINUTE));
    await this.bidding.placeBid(lilies.id, bruno, 85_000_00, at(-90 * MINUTE));
    await this.bidding.placeBid(lilies.id, ana, 92_500_00, at(-60 * MINUTE));
    await this.bidding.placeBid(lilies.id, bruno, 100_000_00, at(-30 * MINUTE));
    lots.aoVivoBrunoLidera = lilies.id;

    // 7) Ao vivo sem lances.
    lots.aoVivoSemLances1 = (
      await this.lots.create(
        seller.id,
        {
          externalId: '24645',
          startingPriceCents: 15_000_00,
          minIncrementCents: 500_00,
          startsAt: iso(-30 * MINUTE),
          endsAt: iso(14 * DAY),
        },
        at(-40 * MINUTE),
      )
    ).id;
    lots.aoVivoSemLances2 = (
      await this.lots.create(
        seller.id,
        {
          externalId: '14655',
          startingPriceCents: 60_000_00,
          minIncrementCents: 1_000_00,
          startsAt: iso(-10 * MINUTE),
          endsAt: iso(7 * DAY),
        },
        at(-15 * MINUTE),
      )
    ).id;

    // 8) Agendados.
    lots.agendado1 = (
      await this.lots.create(
        seller.id,
        {
          externalId: '20684',
          startingPriceCents: 150_000_00,
          minIncrementCents: 5_000_00,
          startsAt: iso(2 * DAY),
          endsAt: iso(12 * DAY),
        },
        at(0),
      )
    ).id;
    lots.agendado2 = (
      await this.lots.create(
        seller.id,
        {
          externalId: '64818',
          startingPriceCents: 70_000_00,
          minIncrementCents: 2_000_00,
          startsAt: iso(5 * DAY),
          endsAt: iso(20 * DAY),
        },
        at(0),
      )
    ).id;

    this.logger.log(
      [
        'Seed de demonstração criada.',
        `  Leiloeiro: ${DEMO_ACCOUNTS.auctioneer.email} / ${DEMO_PASSWORD}`,
        `  Licitante: ${DEMO_ACCOUNTS.ana.email} / ${DEMO_PASSWORD}`,
        `  Licitante: ${DEMO_ACCOUNTS.bruno.email} / ${DEMO_PASSWORD}`,
        `  Lote ao vivo principal: /lotes/${lots.aoVivoBrunoLidera}`,
        `  Lote com auditoria adulterada: /auditoria/${lots.demoAdulterado}`,
      ].join('\n'),
    );
    return { lots };
  }
}
