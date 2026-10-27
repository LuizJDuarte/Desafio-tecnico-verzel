import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { LotDetailDto, LotPageDto, LotViewerDto } from '@arremate/shared';
import { BidPanel } from './BidPanel';

const future = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

function makePage(viewer: Partial<LotViewerDto>, lot: Partial<LotDetailDto> = {}): LotPageDto {
  return {
    lot: {
      id: '6f1d3c1a-1d7e-4a35-9a43-5f2f0c1b2a10',
      number: 6,
      title: 'Water Lilies',
      artist: 'Claude Monet',
      image: { url: null, lqip: null, alt: null, stored: false },
      phase: 'LIVE',
      startsAt: future(-60),
      endsAt: future(60),
      startingPriceCents: 80_000_00,
      minIncrementCents: 2_500_00,
      currentPriceCents: 100_000_00,
      minNextBidCents: 102_500_00,
      bidCount: 4,
      leaderAlias: 'B30958',
      finalPriceCents: null,
      hasWinner: false,
      extended: false,
      state: 'OPEN',
      description: null,
      attributes: [],
      source: {
        provider: 'artic',
        providerName: 'Art Institute of Chicago',
        externalId: '16568',
        url: 'https://www.artic.edu/artworks/16568',
      },
      seller: { name: 'Galeria' },
      originalEndsAt: future(60),
      antiSniping: { windowSeconds: 120, extensionSeconds: 120 },
      cancelledAt: null,
      cancelReason: null,
      settledAt: null,
      createdAt: future(-120),
      ...lot,
    },
    viewer: {
      authenticated: true,
      role: 'BIDDER',
      isSeller: false,
      alias: '4B6E29',
      isLeader: false,
      hasBid: false,
      myMaxBidCents: null,
      position: null,
      totalBidders: 2,
      availableCents: 140_000_00,
      receiptCode: null,
      ...viewer,
    },
    serverTime: new Date().toISOString(),
  };
}

function renderPanel(page: LotPageDto) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(<BidPanel page={page} />, { wrapper });
}

function mockFetchOnce(status: number, body: unknown) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

describe('BidPanel', () => {
  it('mostra "Você está ganhando" para o líder', () => {
    renderPanel(makePage({ isLeader: true, hasBid: true, position: 1, myMaxBidCents: 100_000_00 }));
    expect(screen.getByText('Você está ganhando')).toBeInTheDocument();
    expect(screen.getByLabelText('Licitante 4B6E29')).toBeInTheDocument();
  });

  it('mostra "Você foi superado" e quanto precisa para voltar à liderança', () => {
    renderPanel(makePage({ hasBid: true, position: 2, myMaxBidCents: 92_500_00 }));
    expect(screen.getByText('Você foi superado')).toBeInTheDocument();
    expect(screen.getByText(/dê pelo menos R\$\s102\.500,00/)).toBeInTheDocument();
    expect(screen.getByText('Sua posição: 2º de 2 licitante(s)')).toBeInTheDocument();
  });

  it('exibe o motivo quando o lance é recusado por estar abaixo do mínimo', async () => {
    const fetchMock = mockFetchOnce(422, {
      statusCode: 422,
      code: 'BELOW_MINIMUM',
      message: 'Lance abaixo do mínimo.',
      details: { minimumCents: 102_500_00, isFirstBid: false },
    });
    renderPanel(makePage({}));
    const input = screen.getByLabelText('Valor do lance em reais');
    await userEvent.clear(input);
    await userEvent.type(input, '101.000,00');
    await userEvent.click(screen.getByRole('button', { name: 'Dar lance' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Lance abaixo do mínimo');
    expect(alert).toHaveTextContent(/R\$\s102\.500,00/);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({ amountCents: 101_000_00 });
  });

  it('explica saldo insuficiente e leva para a carteira', async () => {
    mockFetchOnce(422, {
      statusCode: 422,
      code: 'INSUFFICIENT_FUNDS',
      message: 'Saldo insuficiente.',
      details: { availableCents: 50_000_00, amountCents: 102_500_00 },
    });
    renderPanel(makePage({}));
    await userEvent.click(screen.getByRole('button', { name: /Dar lance de R\$/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Saldo insuficiente');
    expect(alert).toHaveTextContent(/R\$\s50\.000,00/);
    expect(screen.getByRole('link', { name: 'Ir para a carteira' })).toHaveAttribute('href', '/carteira');
  });

  it('explica quando o líder tenta cobrir o próprio lance', async () => {
    mockFetchOnce(422, { statusCode: 422, code: 'ALREADY_WINNING', message: '...' });
    renderPanel(makePage({ isLeader: true, hasBid: true }));
    await userEvent.click(screen.getByRole('button', { name: /Dar lance de R\$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Você já é o líder deste lote');
  });

  it('confirma o lance aceito', async () => {
    const page = makePage({});
    mockFetchOnce(201, {
      bid: {
        seq: 5,
        bidderAlias: '4B6E29',
        amountCents: 102_500_00,
        createdAt: new Date().toISOString(),
        endsAtAfter: page.lot.endsAt,
        extended: false,
        hash: 'h',
      },
      lot: {
        ...page.lot,
        currentPriceCents: 102_500_00,
        minNextBidCents: 105_000_00,
        bidCount: 5,
        leaderAlias: '4B6E29',
      },
      viewer: { ...page.viewer, isLeader: true, hasBid: true, position: 1 },
      serverTime: new Date().toISOString(),
    });
    renderPanel(page);
    await userEvent.click(screen.getByRole('button', { name: /Dar lance de R\$/ }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Lance registrado'));
  });

  it('mostra que o lote ainda não começou, com a data', () => {
    renderPanel(makePage({}, { phase: 'SCHEDULED', startsAt: future(30), bidCount: 0, currentPriceCents: null }));
    expect(screen.getByText(/Este lote ainda não começou\. Os lances abrem em/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dar lance/ })).not.toBeInTheDocument();
  });

  it('convida o visitante a entrar e explica que leiloeiros não dão lances', () => {
    const { unmount } = renderPanel(makePage({ authenticated: false, role: null, alias: null, availableCents: null }));
    expect(screen.getByText('Entre para dar lances')).toBeInTheDocument();
    unmount();
    renderPanel(makePage({ role: 'AUCTIONEER', alias: null, availableCents: null }));
    expect(screen.getByText(/não podem dar lances/)).toBeInTheDocument();
  });
});
