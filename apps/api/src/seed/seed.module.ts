import { Module } from '@nestjs/common';
import { AuctionModule } from '../modules/auction/auction.module';
import { AuthModule } from '../modules/auth/auth.module';
import { WalletModule } from '../modules/wallet/wallet.module';
import { DemoSeeder } from './demo-seeder';

@Module({
  imports: [AuctionModule, AuthModule, WalletModule],
  providers: [DemoSeeder],
  exports: [DemoSeeder],
})
export class SeedModule {}
