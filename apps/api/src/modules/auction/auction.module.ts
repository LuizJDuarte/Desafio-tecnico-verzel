import { Module } from '@nestjs/common';
import { AuditSigner } from '../audit/audit-signer.service';
import { AuditController } from '../audit/audit.controller';
import { AuditService } from '../audit/audit.service';
import { PseudonymService } from '../audit/pseudonym.service';
import { ImagesModule } from '../images/images.module';
import { BiddingService } from './bidding.service';
import { LotMapper } from './lot.mapper';
import { AuctioneerController, LotsController, MeController } from './lots.controller';
import { LotsService } from './lots.service';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { SettlementScheduler } from './settlement.scheduler';
import { SettlementService } from './settlement.service';

/** Núcleo do leilão: lotes, lances, liquidação, comprovantes e auditoria. */
@Module({
  imports: [ImagesModule],
  controllers: [LotsController, AuctioneerController, MeController, ReceiptsController, AuditController],
  providers: [
    AuditSigner,
    PseudonymService,
    LotMapper,
    LotsService,
    BiddingService,
    SettlementService,
    SettlementScheduler,
    ReceiptsService,
    AuditService,
  ],
  exports: [
    AuditSigner,
    PseudonymService,
    LotsService,
    BiddingService,
    SettlementService,
    SettlementScheduler,
    AuditService,
  ],
})
export class AuctionModule {}
