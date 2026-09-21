import { test, expect } from '@playwright/test';

const EMAIL = 'owner.demo@demo.com';
const PASSWORD = 'demo123456';

test.describe('Autenticación', () => {
  test('login inválido muestra error y no navega', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', 'clave-incorrecta');
    await page.click('button[type="submit"]');
    await expect(page.getByText(/incorrect|inválid|error/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page).toHaveURL(/\/login/);
  });

  test('login válido entra al calendario', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/calendario/, { timeout: 15_000 });
  });

  test('ruta protegida sin sesión redirige a login', async ({ page }) => {
    await page.goto('/calendario');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
  });
});