import { Controller, Get, Headers, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { notFound } from '../../common/errors';
import { ImagesService } from './images.service';

@ApiTags('Imagens')
@Controller('images')
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Imagem do lote copiada para o nosso banco (independe da API externa)' })
  async get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const image = await this.images.getImage(id);
    if (!image) throw notFound('Imagem');
    const etag = `"${image.sha256}"`;
    res.setHeader('ETag', etag);
    // O conteúdo de um id nunca muda: o navegador pode guardar a imagem por um ano.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (ifNoneMatch === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Type', image.contentType);
    res.setHeader('Content-Length', String(image.data.length));
    res.end(image.data);
  }
}
