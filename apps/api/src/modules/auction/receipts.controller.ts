import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import type { ReceiptDto } from '@arremate/shared';
import { CurrentUser, OptionalAuth } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { ReceiptsService } from './receipts.service';

export class ReceiptCodeParams {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,32}$/, { message: 'Código de comprovante inválido.' })
  code: string;
}

@ApiTags('Comprovantes (públicos)')
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get(':code')
  @OptionalAuth()
  @ApiOperation({ summary: 'Comprovante de arremate compartilhável por link (sem dados pessoais)' })
  get(@Param() params: ReceiptCodeParams, @CurrentUser() user?: AuthUser): Promise<ReceiptDto> {
    return this.receipts.byCode(params.code, user);
  }
}
