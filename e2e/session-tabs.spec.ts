import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

/**
 * Abas do mesmo navegador compartilham o cookie de sessão. Trocar de conta em uma aba atualiza as
 * outras na hora, para ninguém dar lance achando que é a Ana quando a sessão já é do Bruno.
 */
test('sair e entrar com outra conta em uma aba atualiza as outras abas', async ({ context }) => {
  const first = await context.newPage();
  await loginAs(first, 'ana');
  await expect(first.getByText('Ana Souza', { exact: true })).toBeVisible();

  const second = await context.newPage();
  await second.goto('/');
  await second.getByRole('button', { name: 'Sair' }).click();
  await expect(first.getByText('Você saiu da conta em outra aba.')).toBeVisible();
  await expect(first.getByRole('link', { name: 'Entrar' }).first()).toBeVisible();

  await loginAs(second, 'bruno');
  await expect(first.getByText('A sessão mudou em outra aba: agora você está como Bruno Lima.')).toBeVisible();
  await expect(first.getByText('Bruno Lima', { exact: true })).toBeVisible();
});
