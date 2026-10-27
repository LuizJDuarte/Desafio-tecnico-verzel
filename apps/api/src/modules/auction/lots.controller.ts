import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  AuctioneerDashboardDto,
  BidDto,
  LotDetailDto,
  LotPageDto,
  MyBidsResponse,
  PlaceBidResponse,
  ShowcaseResponse,
} from '@arremate/shared';
import { Authenticated, CurrentUser, OptionalAuth } from '../auth/auth.decorators';
import type { AuthUser } from '../auth/auth.types';
import { CancelLotDto, CreateLotDto, PlaceBidDto, ShowcaseQuery } from './auction.dto';
import { BiddingService } from './bidding.service';
import { LotsService } from './lots.service';

@ApiTags('Lotes e lances')
@Controller('lots')
export class LotsController {
  constructor(
    private readonly lots: LotsService,
    private readonly bidding: BiddingService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Vitrine: lotes ao vivo, agendados ou encerrados (cancelados nunca aparecem), com busca' })
  showcase(@Query() query: ShowcaseQuery): Promise<ShowcaseResponse> {
    return this.lots.showcase({
      tab: query.tab ?? 'live',
      q: query.q,
      sort: query.sort,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 12,
    });
  }

  @Get(':id')
  @OptionalAuth()
  @ApiOperation({ summary: 'Sala do lote: detalhes + situação de quem está olhando (líder, posição, saldo)' })
  page(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user?: AuthUser): Promise<LotPageDto> {
    return this.lots.page(id, user);
  }

  @Get(':id/bids')
  @ApiOperation({ summary: 'Histórico público de lances (pseudônimos, mais recente primeiro)' })
  bids(@Param('id', new ParseUUIDPipe()) id: string): Promise<BidDto[]> {
    return this.lots.bids(id);
  }

  @Post()
  @Authenticated('AUCTIONEER')
  @ApiOperation({ summary: 'Cria um lote a partir de uma obra do catálogo externo' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLotDto): Promise<LotDetailDto> {
    return this.lots.create(user.id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Authenticated('AUCTIONEER')
  @ApiOperation({ summary: 'Cancela um lote não encerrado (com lances: estorno automático do líder)' })
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CancelLotDto,
  ): Promise<LotDetailDto> {
    return this.lots.cancel(id, user.id, dto.reason);
  }

  @Post(':id/bids')
  @Authenticated()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Dá um lance (422 com o motivo quando recusado)' })
  placeBid(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: PlaceBidDto,
  ): Promise<PlaceBidResponse> {
    return this.bidding.placeBid(id, user, dto.amountCents);
  }
}

@ApiTags('Painel do leiloeiro')
@Controller('auctioneer')
export class AuctioneerController {
  constructor(private readonly lots: LotsService) {}

  @Get('dashboard')
  @Authenticated('AUCTIONEER')
  @ApiOperation({ summary: 'Lotes do leiloeiro com resultado (arrematado, por quanto) e total recebido' })
  dashboard(@CurrentUser() user: AuthUser): Promise<AuctioneerDashboardDto> {
    return this.lots.dashboard(user.id);
  }
}

@ApiTags('Meus arremates')
@Controller('me')
export class MeController {
  constructor(private readonly lots: LotsService) {}

  @Get('bids')
  @Authenticated('BIDDER')
  @ApiOperation({ summary: 'Lotes em que o licitante deu lance, situação de cada um e comprovantes' })
  myBids(@CurrentUser() user: AuthUser): Promise<MyBidsResponse> {
    return this.lots.myBids(user.id);
  }
}
