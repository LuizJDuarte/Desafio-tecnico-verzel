import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { WALLET_LIMITS, WalletDto } from '@arremate/shared';
import { Authenticated, CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { WalletService } from './wallet.service';

export class DepositDto {
  /** Valor em centavos (ex.: 150000 = R$ 1.500,00). */
  @IsInt({ message: 'O valor deve ser um número inteiro de centavos.' })
  @Min(WALLET_LIMITS.minDepositCents, { message: 'O depósito mínimo é de R$ 1,00.' })
  @Max(WALLET_LIMITS.maxDepositCents, { message: 'O depósito máximo por operação é de R$ 1.000.000,00.' })
  amountCents: number;
}

@ApiTags('Carteira')
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallets: WalletService) {}

  @Get()
  @Authenticated()
  @ApiOperation({ summary: 'Saldo total, comprometido, disponível, compromissos ativos e extrato' })
  getWallet(@CurrentUser() user: AuthUser): Promise<WalletDto> {
    return this.wallets.getWallet(user.id);
  }

  @Post('deposits')
  @HttpCode(201)
  @Authenticated('BIDDER')
  @ApiOperation({ summary: 'Depósito simulado na carteira do licitante' })
  deposit(@CurrentUser() user: AuthUser, @Body() dto: DepositDto): Promise<WalletDto> {
    return this.wallets.deposit(user.id, dto.amountCents);
  }
}
