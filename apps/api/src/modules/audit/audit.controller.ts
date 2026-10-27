import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuditResponse, PublicKeyDto } from '@arremate/shared';
import { AuditSigner } from './audit-signer.service';
import { AuditService } from './audit.service';

@ApiTags('Auditoria (pública)')
@Controller('audit')
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly signer: AuditSigner,
  ) {}

  @Get('public-key')
  @ApiOperation({ summary: 'Chave pública Ed25519 usada para verificar assinaturas do histórico' })
  publicKey(): PublicKeyDto {
    return this.signer.publicKeyDto();
  }

  @Get('lots/:id')
  @ApiOperation({ summary: 'Pacote de auditoria do lote + relatório de integridade (íntegro ou adulterado)' })
  lot(@Param('id', new ParseUUIDPipe()) id: string): Promise<AuditResponse> {
    return this.audit.audit(id);
  }
}
