import { expect, test } from '@playwright/test';
import { loginAs, openMainLot } from './helpers';

test.describe('Auditoria pública e comprovante', () => {
  test('histórico íntegro é confirmado pelo servidor e pelo navegador', async ({ page }) => {
    await openMainLot(page);
    await page.getByRole('link', { name: 'Auditar' }).click();
    await expect(page.getByText('Histórico íntegro')).toBeVisible();
    await expect(page.getByText(/Seu navegador: íntegro/)).toBeVisible();
    await expect(page.getByText('Gênese: termos do lote')).toBeVisible();
  });

  test('o lote de demonstração adulterado direto no banco é denunciado', async ({ page }) => {
    await page.goto('/?aba=closed&busca=Moulin');
    await page.getByRole('link', { name: /At the Moulin Rouge/ }).click();
    await page.getByRole('link', { name: 'Auditar' }).click();
    await expect(page.getByText('Histórico adulterado')).toBeVisible();
    await expect(page.getByText(/Seu navegador: adulterado/)).toBeVisible();
    await expect(
      page.getByText('O conteúdo do lance #2 foi alterado depois de registrado (o hash não confere).').first(),
    ).toBeVisible();
  });

  test('arrematante vê o comprovante com assinatura válida e link compartilhável', async ({ page }) => {
    await loginAs(page, 'ana');
    await page.goto('/meus-arremates');
    await page.getByRole('tab', { name: /Arrematados/ }).click();
    await page.getByRole('link', { name: 'Comprovante' }).first().click();
    await expect(page.getByRole('heading', { name: 'Comprovante de arremate' })).toBeVisible();
    await expect(page.getByText('Este comprovante é seu.', { exact: false })).toBeVisible();
    await expect(page.getByText('Assinatura digital válida (conferida no seu navegador)')).toBeVisible();

    // Qualquer pessoa com o link vê o comprovante (sem dados pessoais).
    const url = page.url();
    const anonymous = await page.context().browser()!.newPage();
    await anonymous.goto(url);
    await expect(anonymous.getByRole('heading', { name: 'Comprovante de arremate' })).toBeVisible();
    await expect(anonymous.getByText('Ana Souza')).toHaveCount(0);
    await anonymous.close();
  });
});
