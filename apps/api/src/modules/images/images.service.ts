import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, IsNull, Not } from 'typeorm';
import { Clock } from '../../common/clock';
import { AppConfig } from '../../config/app-config';
import { LotEntity, LotImageEntity } from '../../database/entities';
import { CircuitBreaker } from '../catalog/http/circuit-breaker';
import { museumIdentityHeaders } from '../catalog/http/identity-headers';
import { ResilientHttpClient } from '../catalog/http/resilient-http-client';
import { TokenBucket } from '../catalog/http/token-bucket';

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
/** Proteção contra SSRF: só baixamos imagens de domínios do museu, nunca de URLs arbitrárias. */
const ALLOWED_IMAGE_HOSTS = [/(^|\.)artic\.edu$/i];

export interface StoredImage {
  data: Buffer;
  contentType: string;
  sha256: string;
}

/**
 * Copia a imagem do item para o nosso banco no momento da criação do lote. Se o download falhar,
 * o lote é criado mesmo assim (com a URL remota e o placeholder borrado "lqip") e uma rotina tenta
 * de novo mais tarde.
 */
@Injectable()
export class ImagesService {
  private readonly logger = new Logger(ImagesService.name);
  private readonly http: ResilientHttpClient | null;

  constructor(
    private readonly dataSource: DataSource,
    private readonly clock: Clock,
    config: AppConfig,
  ) {
    this.http = config.catalog.imageDownloadEnabled
      ? new ResilientHttpClient({
          name: 'Servidor de imagens do museu',
          timeoutMs: 10_000,
          retries: 1,
          baseBackoffMs: 400,
          maxWaitForTokenMs: 5_000,
          headers: { Accept: 'image/jpeg,image/*;q=0.8', ...museumIdentityHeaders(config.catalog.contact) },
          breaker: new CircuitBreaker({ failureThreshold: 3, openMs: 60_000 }),
          bucket: new TokenBucket(5, 1),
        })
      : null;
  }

  isAllowedUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.some((pattern) => pattern.test(parsed.hostname));
    } catch {
      return false;
    }
  }

  /** Baixa e grava a imagem. Retorna o id local ou null (falha não interrompe a criação do lote). */
  async storeFromUrl(url: string | null): Promise<string | null> {
    if (!url || !this.http || !this.isAllowedUrl(url)) return null;
    try {
      const { data, contentType } = await this.http.getBinary(url, MAX_IMAGE_BYTES);
      if (!contentType.startsWith('image/') || data.length === 0) return null;
      const id = randomUUID();
      await this.dataSource.getRepository(LotImageEntity).insert({
        id,
        contentType: contentType.split(';')[0].trim(),
        data,
        byteSize: data.length,
        sha256: createHash('sha256').update(data).digest('hex'),
        sourceUrl: url,
        createdAt: this.clock.now(),
      });
      return id;
    } catch (error) {
      this.logger.warn(`Não foi possível copiar a imagem ${url}: ${(error as Error).message}`);
      return null;
    }
  }

  async getImage(id: string): Promise<StoredImage | null> {
    const row = await this.dataSource
      .getRepository(LotImageEntity)
      .createQueryBuilder('i')
      .addSelect('i.data')
      .where('i.id = :id', { id })
      .getOne();
    return row ? { data: row.data, contentType: row.contentType, sha256: row.sha256 } : null;
  }

  /** Tenta novamente copiar imagens de lotes criados enquanto o servidor de imagens estava fora. */
  async backfillMissing(limit = 5): Promise<number> {
    if (!this.http) return 0;
    const lots = await this.dataSource.getRepository(LotEntity).find({
      select: { id: true, imageRemoteUrl: true },
      where: { imageId: IsNull(), imageRemoteUrl: Not(IsNull()) },
      take: limit,
    });
    let stored = 0;
    for (const lot of lots) {
      const imageId = await this.storeFromUrl(lot.imageRemoteUrl);
      if (!imageId) break;
      await this.dataSource.getRepository(LotEntity).update({ id: lot.id }, { imageId });
      stored++;
    }
    return stored;
  }
}
