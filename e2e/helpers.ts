import { expect, type Browser, type Page } from '@playwright/test';

export const DEMO = {
  ana: 'Ana Souza',
  bruno: 'Bruno Lima',
  auctioneer: 'Galeria Aurora Leilões',
} as const;

/** Entra pelo botão de conta de demonstração (o mesmo caminho que o avaliador usa). */
export async function loginAs(page: Page, account: keyof typeof DEMO): Promise<void> {
  await page.goto('/entrar');
  await page.getByRole('button', { name: new RegExp(DEMO[account]) }).click();
  await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
}

export async function newSession(browser: Browser, account: keyof typeof DEMO): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, account);
  return page;
}

/** Abre a sala do lote principal da seed (Water Lilies, a disputa mais movimentada). */
export async function openMainLot(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('link', { name: /Entrar na sala do lote/ }).click();
  await expect(page.getByRole('heading', { name: 'Histórico de lances' })).toBeVisible();
}
