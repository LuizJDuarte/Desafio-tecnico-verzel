import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { LOT_LIMITS, MAX_BID_CENTS } from '@arremate/shared';
import type { ShowcaseSort, ShowcaseTab } from '@arremate/shared';

const trimOrUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

export class CreateLotDto {
  /** Id da obra no Art Institute of Chicago (vem da busca do catálogo). */
  @Matches(/^\d{1,10}$/, { message: 'Selecione uma obra válida do catálogo.' })
  externalId: string;

  /** Título opcional (por padrão, o título da obra no museu). */
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(300, { message: 'O título pode ter no máximo 300 caracteres.' })
  title?: string;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(2000, { message: 'A descrição pode ter no máximo 2000 caracteres.' })
  description?: string;

  /** Lance inicial (valor mínimo) em centavos. */
  @IsInt({ message: 'O lance inicial deve ser um valor inteiro em centavos.' })
  @Min(LOT_LIMITS.minPriceCents, { message: 'O lance inicial mínimo é R$ 1,00.' })
  @Max(LOT_LIMITS.maxPriceCents, { message: 'O lance inicial máximo é R$ 100.000.000,00.' })
  startingPriceCents: number;

  /** Incremento mínimo entre lances, em centavos. */
  @IsInt({ message: 'O incremento deve ser um valor inteiro em centavos.' })
  @Min(LOT_LIMITS.minIncrementCents, { message: 'O incremento mínimo é R$ 1,00.' })
  @Max(LOT_LIMITS.maxIncrementCents, { message: 'O incremento máximo é R$ 10.000.000,00.' })
  minIncrementCents: number;

  /** true = o lote começa imediatamente (ignora startsAt). */
  @IsOptional()
  @IsBoolean()
  startNow?: boolean;

  @ValidateIf((dto: CreateLotDto) => !dto.startNow)
  @IsISO8601({ strict: true }, { message: 'Informe uma data de início válida.' })
  startsAt?: string;

  @IsISO8601({ strict: true }, { message: 'Informe uma data de encerramento válida.' })
  endsAt: string;
}

export class CancelLotDto {
  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(300, { message: 'O motivo pode ter no máximo 300 caracteres.' })
  reason?: string;
}

export class PlaceBidDto {
  /** Valor do lance em centavos. */
  @IsInt({ message: 'O lance deve ser um valor inteiro em centavos.' })
  @Min(1, { message: 'O lance deve ser maior que zero.' })
  @Max(MAX_BID_CENTS, { message: 'Valor de lance acima do permitido.' })
  amountCents: number;
}

export class ShowcaseQuery {
  @IsOptional()
  @IsIn(['live', 'scheduled', 'closed'], { message: 'Aba inválida.' })
  tab?: ShowcaseTab;

  @IsOptional()
  @Transform(trimOrUndefined)
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(['relevance', 'ending', 'newest', 'price_asc', 'price_desc'], { message: 'Ordenação inválida.' })
  sort?: ShowcaseSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  pageSize?: number;
}
