import { expect, test } from '@playwright/test';
import { EMPTY_STYLE } from './helpers';

test.use({ locale: 'es-ES' });

test('the UI follows the system language (Spanish)', async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill({ json: EMPTY_STYLE }),
  );

  await page.goto('/?e2e');
  await page.locator('[data-testid="app-ready"]').waitFor();
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page).toHaveTitle('Zonas azules cerca de mí');

  await page.getByRole('button', { name: 'Cerca de mí' }).click();
  const cards = page.locator('.cards > li[data-zone-id]');
  await expect(cards).toHaveCount(3);
  await expect(cards.first().getByRole('button', { name: 'Ir' })).toBeVisible();
  await expect(cards.first()).toContainText('plazas azules');
  await expect(cards.first()).toContainText('de ti');
});
