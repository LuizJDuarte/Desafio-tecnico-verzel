import { expect, test } from '@playwright/test';
import { newSession, openMainLot } from './helpers';

test.describe('Sala do lote ao vivo', () => {
  test('dois licitantes disputam e a sala atualiza sem recarregar', async ({ browser }) => {
    const ana = await newSession(browser, 'ana');
    const bruno = await newSession(browser, 'bruno');
    await openMainLot(ana);
    await openMainLot(bruno);

    // Na seed, Bruno lidera o lote principal.
    await expect(bruno.getByText('Você está ganhando', { exact: true })).toBeVisible();
    await expect(ana.getByText('Você foi superado', { exact: true })).toBeVisible();

    // Ana dá o lance mínimo com um clique.
    const minimumButton = ana.getByRole('button', { name: /Dar lance de R\$/ });
    const label = (await minimumButton.textContent()) ?? '';
    const amount = label.replace('Dar lance de ', '').trim();
    await minimumButton.click();
    await expect(ana.getByText('Você está ganhando', { exact: true })).toBeVisible();
    await expect(ana.getByRole('status').filter({ hasText: 'Lance registrado' })).toBeVisible();

    // Bruno é avisado em tempo real (sem recarregar a página): na sala e por notificação.
    await expect(bruno.getByText('Você foi superado', { exact: true })).toBeVisible();
    await expect(bruno.getByText(`Você foi superado em "Water Lilies"`)).toBeVisible();
    await expect(bruno.getByRole('list', { name: 'Histórico de lances' }).getByRole('listitem').first()).toContainText(
      amount,
    );

    // Recusas com motivo claro.
    await bruno.getByLabel('Valor do lance em reais').fill('1.000,00');
    await bruno.getByRole('button', { name: 'Dar lance', exact: true }).click();
    await expect(bruno.getByRole('alert')).toContainText('Lance abaixo do mínimo');

    await ana.getByRole('button', { name: /Dar lance de R\$/ }).click();
    await expect(ana.getByRole('alert')).toContainText('Você já é o líder deste lote');

    await ana.context().close();
    await bruno.context().close();
  });

  test('visitante sem login acompanha a sala e é convidado a entrar', async ({ page }) => {
    await openMainLot(page);
    await expect(page.getByText('Entre para dar lances')).toBeVisible();
    await expect(page.getByRole('button', { name: /Dar lance/ })).toHaveCount(0);
  });
});
