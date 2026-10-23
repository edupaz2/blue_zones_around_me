import { expect, test } from '@playwright/test';
import { EMPTY_STYLE } from './helpers';

// Photon answers are stubbed so the test never depends on the live geocoder.
const PHOTON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-3.7038, 40.4168] },
      properties: { name: 'Puerta del Sol', city: 'Madrid' },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-3.7092, 40.4155] },
      properties: { name: 'Plaza Mayor', city: 'Madrid' },
    },
  ],
};

test('the search suggestions popup can be closed without losing the typed text', async ({
  page,
}, testInfo) => {
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill({ json: EMPTY_STYLE }),
  );
  await page.route('https://photon.komoot.io/**', (route) => route.fulfill({ json: PHOTON }));

  await page.goto('/?e2e');
  await page.locator('[data-testid="app-ready"]').waitFor();

  const box = page.getByRole('searchbox');
  await box.fill('sol');
  await expect(page.getByRole('button', { name: 'Puerta del Sol, Madrid' })).toBeVisible();

  const close = page.getByRole('button', { name: 'Close suggestions' });
  await expect(close).toBeVisible();
  const size = await close.boundingBox();
  expect(size!.width).toBeGreaterThanOrEqual(48);
  expect(size!.height).toBeGreaterThanOrEqual(48);

  // The button sits over the first row, so it must not cover the settings gear.
  const gear = await page.getByRole('button', { name: 'Settings' }).boundingBox();
  expect(size!.x + size!.width).toBeLessThanOrEqual(gear!.x);
  await page.screenshot({ path: testInfo.outputPath('search-popup-open.png') });

  await close.click();
  await expect(page.getByRole('button', { name: 'Puerta del Sol, Madrid' })).toHaveCount(0);
  await expect(close).toHaveCount(0);
  await expect(box).toHaveValue('sol');
  await page.screenshot({ path: testInfo.outputPath('search-popup-closed.png') });

  // Escape closes it too, and must not wipe a type="search" field.
  await box.fill('plaza');
  await expect(page.getByRole('button', { name: 'Plaza Mayor, Madrid' })).toBeVisible();
  await box.press('Escape');
  await expect(page.getByRole('button', { name: 'Plaza Mayor, Madrid' })).toHaveCount(0);
  await expect(box).toHaveValue('plaza');
});
