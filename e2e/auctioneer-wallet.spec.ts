import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('Painel do leiloeiro', () => {
  test('cria um lote a partir do catálogo e depois cancela', async ({ page }) => {
    await loginAs(page, 'auctioneer');
    await page.goto('/painel');
    await expect(page.getByText('Total recebido')).toBeVisible();
    await expect(page.getByText('R$ 280.000,00')).toBeVisible();

    await page.getByRole('link', { name: 'Criar lote' }).click();
    await page.getByPlaceholder(/Ex\.: Monet/).fill('Paris Street');
    await page.getByRole('button', { name: /Paris Street; Rainy Day/ }).click();
    await page.getByLabel('Título do lote').fill('Rua de Paris em dia de chuva (teste E2E)');
    await page.getByRole('button', { name: '30 min' }).click();
    await page.getByRole('button', { name: 'Publicar lote' }).click();

    await expect(page.getByText('Este lote é seu')).toBeVisible();
    await expect(page.getByText('Rua de Paris em dia de chuva (teste E2E)').first()).toBeVisible();

    await page.goto('/?busca=E2E');
    await expect(page.getByRole('link', { name: /Rua de Paris em dia de chuva/ })).toBeVisible();

    await page.goto('/painel');
    const row = page.getByRole('row', { name: /Rua de Paris em dia de chuva/ });
    await row.getByRole('button', { name: 'Cancelar' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar lote' }).click();
    await expect(row.getByText('Cancelado')).toBeVisible();

    await page.goto('/?busca=E2E');
    await expect(page.getByText('Nada encontrado para "E2E" nesta aba.')).toBeVisible();
  });
});

test.describe('Carteira', () => {
  test('depósito simulado atualiza total e disponível', async ({ page }) => {
    await loginAs(page, 'bruno');
    await page.goto('/carteira');
    const total = page.locator('dt', { hasText: 'Saldo total' }).locator('xpath=following-sibling::dd');
    const before = (await total.textContent()) ?? '';
    await page.getByRole('button', { name: 'R$ 5.000,00' }).click();
    await page.getByRole('button', { name: 'Depositar' }).click();
    await expect(page.getByText('Depósito de R$ 5.000,00 feito.')).toBeVisible();
    await expect(total).not.toHaveText(before);
    await expect(page.getByRole('cell', { name: /Depósito simulado/ }).first()).toBeVisible();
  });
});
