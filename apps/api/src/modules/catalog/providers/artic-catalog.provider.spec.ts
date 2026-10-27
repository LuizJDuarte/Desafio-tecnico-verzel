import { CircuitBreaker } from '../http/circuit-breaker';
import { FetchFn, ResilientHttpClient } from '../http/resilient-http-client';
import { TokenBucket } from '../http/token-bucket';
import { ArticCatalogProvider } from './artic-catalog.provider';
import { mapArticArtwork } from './artic.mapper';
import { ARTWORKS_SNAPSHOT } from './artworks.snapshot';

/** Resposta no formato documentado da API do museu (pagination, data, info, config). */
const SEARCH_FIXTURE = {
  preference: null,
  pagination: { total: 2, limit: 12, offset: 0, total_pages: 1, current_page: 1 },
  data: [
    {
      _score: 120.5,
      ...ARTWORKS_SNAPSHOT[0],
      thumbnail: { lqip: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', alt_text: 'Lírios' },
    },
    { _score: 80.1, id: 999, title: 'Obra sem imagem', image_id: null, is_public_domain: true },
  ],
  info: { license_text: 'CC0', version: '1.14' },
  config: { iiif_url: 'https://www.artic.edu/iiif/2', website_url: 'http://www.artic.edu' },
};

function providerWith(fetchFn: FetchFn) {
  const http = new ResilientHttpClient({
    name: 'Art Institute of Chicago',
    timeoutMs: 1000,
    retries: 0,
    baseBackoffMs: 1,
    maxWaitForTokenMs: 1000,
    headers: {},
    breaker: new CircuitBreaker({ failureThreshold: 3, openMs: 1000 }),
    bucket: new TokenBucket(10, 10),
    fetchFn,
  });
  return new ArticCatalogProvider(http, 'https://api.artic.edu/api/v1');
}

describe('mapArticArtwork', () => {
  it('converte o registro do museu em item do catálogo com atributos em português', () => {
    const item = mapArticArtwork(ARTWORKS_SNAPSHOT[2]); // Hokusai (artista com quebra de linha)
    expect(item.externalId).toBe('24645');
    expect(item.artist).toBe('Katsushika Hokusai');
    expect(item.imageUrl).toBe(
      'https://www.artic.edu/iiif/2/b3974542-b9b4-7568-fc4b-966738f61d78/full/843,/0/default.jpg',
    );
    expect(item.thumbnailUrl).toContain('/full/400,/0/default.jpg');
    expect(item.sourceUrl).toBe('https://www.artic.edu/artworks/24645');
    const artist = item.attributes.find((attribute) => attribute.label === 'Artista');
    expect(artist?.value).toBe('Katsushika Hokusai 葛飾 北斎, Japanese, 1760-1849');
    expect(item.attributes.map((attribute) => attribute.label)).toEqual(
      expect.arrayContaining(['Data', 'Técnica', 'Dimensões', 'Origem', 'Procedência']),
    );
  });

  it('descarta lqip que não seja uma imagem em data URI', () => {
    const item = mapArticArtwork({ id: 1, title: 'x', thumbnail: { lqip: 'javascript:alert(1)' } });
    expect(item.lqip).toBeNull();
    expect(item.title).toBe('x');
  });
});

describe('ArticCatalogProvider', () => {
  it('busca só obras em domínio público, com campos reduzidos, e ignora itens sem imagem', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<FetchFn>>()
      .mockResolvedValue(new Response(JSON.stringify(SEARCH_FIXTURE), { status: 200 }));
    const page = await providerWith(fetchFn).search('water lilies', 1);

    const url = new URL(fetchFn.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/v1/artworks/search');
    expect(url.searchParams.get('q')).toBe('water lilies');
    expect(url.searchParams.get('query[term][is_public_domain]')).toBe('true');
    expect(url.searchParams.get('fields')).toContain('image_id');
    expect(page.items).toHaveLength(1);
    expect(page.items[0].title).toBe('Water Lilies');
    expect(page.items[0].lqip).toMatch(/^data:image\/gif;base64,/);
    expect(page.totalPages).toBe(1);
  });

  it('retorna null para obra inexistente (404) e para ids inválidos', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<FetchFn>>()
      .mockResolvedValue(new Response('{}', { status: 404 }));
    const provider = providerWith(fetchFn);
    await expect(provider.getItem('123')).resolves.toBeNull();
    await expect(provider.getItem('../etc/passwd')).resolves.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('acusa resposta em formato inesperado', async () => {
    const fetchFn = jest
      .fn<Promise<Response>, Parameters<FetchFn>>()
      .mockResolvedValue(new Response(JSON.stringify({ unexpected: true }), { status: 200 }));
    await expect(providerWith(fetchFn).search('x', 1)).rejects.toMatchObject({ kind: 'INVALID_RESPONSE' });
  });
});
