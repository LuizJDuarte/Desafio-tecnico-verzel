import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Cópia local da imagem do item. O servidor de imagens do museu (IIIF) pode ficar fora do ar ou
 * bloquear acessos; com a cópia, a vitrine e o comprovante continuam exibindo a obra.
 */
@Entity('lot_images')
export class LotImageEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ name: 'content_type', type: 'varchar', length: 100 })
  contentType: string;

  @Column({ type: 'bytea', select: false })
  data: Buffer;

  @Column({ name: 'byte_size', type: 'integer' })
  byteSize: number;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ name: 'source_url', type: 'text' })
  sourceUrl: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
