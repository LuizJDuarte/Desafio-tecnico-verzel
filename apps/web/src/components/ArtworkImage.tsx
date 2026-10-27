import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { LotImageDto } from '@arremate/shared';
import { cn } from '../lib/cn';

interface ArtworkImageProps {
  image: LotImageDto;
  title: string;
  /** Altura da moldura (a obra nunca é cortada: fica inteira dentro do passe-partout). */
  className?: string;
  eager?: boolean;
  /** Miniaturas mostram só o ícone quando a imagem não está disponível. */
  thumb?: boolean;
}

/**
 * Obra dentro de um passe-partout. Mostra o "lqip" (miniatura borrada que vem da API do museu)
 * enquanto a imagem carrega, e uma moldura vazia elegante se a imagem não estiver disponível.
 */
export function ArtworkImage({ image, title, className, eager = false, thumb = false }: ArtworkImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(image.url) && !failed;

  return (
    <div
      className={cn('relative flex items-center justify-center overflow-hidden rounded-[3px] bg-mat p-[7%]', className)}
    >
      {image.lqip && !loaded && showImage && (
        <div
          aria-hidden
          className="absolute inset-[7%] bg-cover bg-center blur-md"
          style={{ backgroundImage: `url(${image.lqip})` }}
        />
      )}
      {showImage ? (
        <img
          src={image.url!}
          alt={image.alt ?? title}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            'relative max-h-full max-w-full object-contain shadow-hung transition-opacity duration-500',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : thumb ? (
        <div
          className="relative grid h-full w-full place-items-center border border-line-strong/70 text-ink-faint"
          title="Imagem indisponível no momento"
        >
          <ImageOff className="size-4" aria-label="Imagem indisponível no momento" />
        </div>
      ) : (
        <div className="relative flex h-full w-full flex-col items-center justify-center gap-2 border border-line-strong/70 px-4 text-center text-ink-faint">
          <ImageOff className="size-6" aria-hidden />
          <span className="title-art line-clamp-2 text-sm">{title}</span>
          <span className="text-xs">Imagem indisponível no momento</span>
        </div>
      )}
    </div>
  );
}
