import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

/**
 * Encerramento real (sem relógio simulado). Como o lote dura só 65 s, o lance cai nos últimos
 * 2 minutos e PRORROGA o fim para 2 minutos depois dele (anti-sniping). Depois disso o agendador
 * liquida o lote no horário exato e a sala avisa o arrematante em tempo real. Leva cerca de 2 minutos.
 */
test('lote prorrogado encerra sozinho, liquida e avisa o arrematante em tempo real', async ({
  page,
  playwright,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const seller = await playwright.request.newContext({ baseURL });
  await seller.post('/api/auth/login', { data: { email: 'leiloeiro@example.com', password: 'arremate123' } });
  const created = await seller.post('/api/lots', {
    data: {
      externalId: '14655',
      title: 'Lote relâmpago (teste E2E)',
      startingPriceCents: 1_000_00,
      minIncrementCents: 100_00,
      startNow: true,
      endsAt: new Date(Date.now() + 65_000).toISOString(),
    },
  });
  expect(created.status()).toBe(201);
  const lot = (await created.json()) as { id: string };

  await loginAs(page, 'ana');
  await page.goto(`/lotes/${lot.id}`);
  await page.getByRole('button', { name: /Dar lance de R\$/ }).click();
  await expect(page.getByText('Você está ganhando')).toBeVisible();
  await expect(page.getByText('Prorrogado por lances de última hora')).toBeVisible();
  await expect(page.getByText('prorrogou o fim')).toBeVisible();

  // Sem recarregar: a contagem chega a zero, o servidor liquida e a sala mostra o resultado.
  await expect(page.getByText('Você arrematou', { exact: true })).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText(/Você arrematou "Lote relâmpago \(teste E2E\)"/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver comprovante de arremate' })).toBeVisible();
  await seller.dispose();
});
