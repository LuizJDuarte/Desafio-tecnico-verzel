import type { CatalogItemDto, LotAttribute } from '@arremate/shared';

export const ARTIC_DEFAULT_IIIF_URL = 'https://www.artic.edu/iiif/2';
export const ARTIC_WEBSITE_URL = 'https://www.artic.edu';

/** Campos pedidos à API (o parâmetro "fields" deixa a resposta bem menor e mais rápida). */
export const ARTIC_FIELDS = [
  'id',
  'title',
  'image_id',
  'artist_display',
  'artist_title',
  'date_display',
  'medium_display',
  'dimensions',
  'place_of_origin',
  'credit_line',
  'artwork_type_title',
  'department_title',
  'style_title',
  'is_public_domain',
  'thumbnail',
  'main_reference_number',
] as const;

/** Formato (parcial) de uma obra na API do Art Institute of Chicago. */
export interface ArticArtwork {
  id: number;
  title?: string | null;
  image_id?: string | null;
  artist_display?: string | null;
  artist_title?: string | null;
  date_display?: string | null;
  medium_display?: string | null;
  dimensions?: string | null;
  place_of_origin?: string | null;
  credit_line?: string | null;
  artwork_type_title?: string | null;
  department_title?: string | null;
  style_title?: string | null;
  is_public_domain?: boolean | null;
  main_reference_number?: string | null;
  thumbnail?: { lqip?: string | null; alt_text?: string | null; width?: number; height?: number } | null;
}

export interface ArticSearchResponse {
  pagination: { total: number; limit: number; offset: number; total_pages: number; current_page: number };
  data: ArticArtwork[];
  config?: { iiif_url?: string; website_url?: string };
}

export interface ArticDetailResponse {
  data: ArticArtwork;
  config?: { iiif_url?: string; website_url?: string };
}

const clean = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value
    .replace(/\s*\n\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized === '' ? null : normalized;
};

/** Só aceita data URI de imagem (o lqip vem como "data:image/gif;base64,..."). */
const safeLqip = (value: string | null | undefined): string | null =>
  typeof value === 'string' &&
  /^data:image\/(gif|png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value) &&
  value.length < 20_000
    ? value
    : null;

export function articImageUrl(iiifBase: string, imageId: string, width: number): string {
  return `${iiifBase.replace(/\/$/, '')}/${encodeURIComponent(imageId)}/full/${width},/0/default.jpg`;
}

/** Converte o registro do museu no formato neutro do catálogo, com rótulos em português. */
export function mapArticArtwork(raw: ArticArtwork, iiifBase: string = ARTIC_DEFAULT_IIIF_URL): CatalogItemDto {
  const artistDisplay = clean(raw.artist_display);
  const pairs: Array<[string, string | null]> = [
    ['Artista', artistDisplay],
    ['Data', clean(raw.date_display)],
    ['Técnica', clean(raw.medium_display)],
    ['Dimensões', clean(raw.dimensions)],
    ['Origem', clean(raw.place_of_origin)],
    ['Tipo', clean(raw.artwork_type_title)],
    ['Estilo', clean(raw.style_title)],
    ['Departamento', clean(raw.department_title)],
    ['Procedência', clean(raw.credit_line)],
    ['Nº de referência', clean(raw.main_reference_number)],
  ];
  const attributes: LotAttribute[] = pairs
    .filter((pair): pair is [string, string] => pair[1] !== null)
    .map(([label, value]) => ({ label, value: value.slice(0, 500) }));

  const imageId = clean(raw.image_id);
  return {
    source: 'artic',
    externalId: String(raw.id),
    title: (clean(raw.title) ?? 'Sem título').slice(0, 300),
    artist: clean(raw.artist_title) ?? artistDisplay?.split(',')[0]?.trim() ?? null,
    date: clean(raw.date_display),
    medium: clean(raw.medium_display),
    dimensions: clean(raw.dimensions),
    origin: clean(raw.place_of_origin),
    creditLine: clean(raw.credit_line),
    type: clean(raw.artwork_type_title),
    imageUrl: imageId ? articImageUrl(iiifBase, imageId, 843) : null,
    thumbnailUrl: imageId ? articImageUrl(iiifBase, imageId, 400) : null,
    lqip: safeLqip(raw.thumbnail?.lqip),
    altText: clean(raw.thumbnail?.alt_text),
    isPublicDomain: raw.is_public_domain === true,
    sourceUrl: `${ARTIC_WEBSITE_URL}/artworks/${raw.id}`,
    attributes,
  };
}
