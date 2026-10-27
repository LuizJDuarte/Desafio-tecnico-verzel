import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import type { CatalogItemDto, CatalogSearchResponse, CatalogStatusDto } from '@arremate/shared';
import { Authenticated } from '../auth/auth.decorators';
import { CatalogService } from './catalog.service';

export class CatalogSearchQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'A busca pode ter no máximo 100 caracteres.' })
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(800)
  page?: number;
}

export class CatalogItemParams {
  @Matches(/^\d{1,10}$/, { message: 'Identificador de obra inválido.' })
  externalId: string;
}

@ApiTags('Catálogo (API externa)')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('search')
  @Authenticated('AUCTIONEER')
  @ApiOperation({ summary: 'Busca obras em domínio público no Art Institute of Chicago (com cache e fallback)' })
  search(@Query() query: CatalogSearchQuery): Promise<CatalogSearchResponse> {
    return this.catalog.search(query.q ?? '', query.page ?? 1);
  }

  @Get('items/:externalId')
  @Authenticated('AUCTIONEER')
  @ApiOperation({ summary: 'Detalhes de uma obra do catálogo externo' })
  item(@Param() params: CatalogItemParams): Promise<CatalogItemDto> {
    return this.catalog.getItem(params.externalId);
  }

  @Get('status')
  @ApiOperation({ summary: 'Estado da integração com a API externa (circuit breaker)' })
  status(): CatalogStatusDto {
    return this.catalog.status();
  }
}
