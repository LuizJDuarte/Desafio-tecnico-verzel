import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DataSource } from 'typeorm';
import type { HealthDto } from '@arremate/shared';
import { Clock } from '../../common/clock';
import { CatalogService } from '../catalog/catalog.service';

@ApiTags('Saúde')
@Controller('health')
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly catalog: CatalogService,
    private readonly clock: Clock,
  ) {}

  /** Checagem leve usada pelo Render: não toca no banco (deixa o Neon hibernar quando ocioso). */
  @Get('live')
  @SkipThrottle()
  @ApiOperation({ summary: 'Liveness: o processo está de pé' })
  live(): { status: 'ok'; time: string } {
    return { status: 'ok', time: this.clock.now().toISOString() };
  }

  @Get()
  @SkipThrottle()
  @ApiOperation({ summary: 'Saúde da aplicação: banco e integração com a API externa' })
  async health(): Promise<HealthDto> {
    let database: HealthDto['database'] = 'up';
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      database = 'down';
    }
    const catalog = this.catalog.status();
    return {
      // A API externa fora do ar NÃO derruba a aplicação: só marca como "degraded".
      status: database === 'up' && catalog.circuit === 'CLOSED' ? 'ok' : 'degraded',
      time: this.clock.now().toISOString(),
      database,
      catalog,
      version: process.env.npm_package_version ?? '1.0.0',
    };
  }
}
