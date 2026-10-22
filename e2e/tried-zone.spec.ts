import { expect, test } from '@playwright/test';

const SHOTS =
  '/private/tmp/claude-502/-Users-eduardo-paz-tmpdev-blue-zones-around-me/423a7f1a-c917-4995-8efc-525b480906b4/scratchpad';

// Minimal offline style so the test never depends on tiles.openfreemap.org.
const EMPTY_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef' } }],
};

declare global {
  interface Window {
    __opened: string[];
  }
}

test('tried zone is excluded after reload and next zone', async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill({ json: EMPTY_STYLE }),
  );
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = (url) => {
      window.__opened.push(String(url));
      return null;
    };
  });

  await page.goto('/');
  await page.locator('[data-testid="app-ready"]').waitFor();
  await page.getByRole('button', { name: 'Around me' }).click();

  const cards = page.locator('.cards > li[data-zone-id]');
  await expect(cards).toHaveCount(3);
  const firstId = await cards.first().getAttribute('data-zone-id');
  expect(firstId).toBeTruthy();

  const map = page.locator('[data-testid="map"]');
  const canvas = map.locator('canvas.maplibregl-canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box!.width).toBeGreaterThan(0);
  expect(box!.height).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/e2e-after-around-me.png`, fullPage: true });

  await cards.first().getByRole('button', { name: 'Go' }).click();
  await page.getByRole('button', { name: 'Google Maps' }).click();
  const opened = await page.evaluate(() => window.__opened);
  expect(opened[0]).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);

  await page.reload();
  const dialog = page.getByRole('dialog', { name: 'Found a spot?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'No, next zone' }).click();

  await expect(cards).toHaveCount(3);
  await expect(page.locator(`.cards > li[data-zone-id="${firstId}"]`)).toHaveCount(0);
  await expect(map).toHaveAttribute('data-tried-count', '1');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOTS}/e2e-after-next-zone.png`, fullPage: true });
});
