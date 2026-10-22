import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';

// Minimal offline style so the test never depends on tiles.openfreemap.org.
const EMPTY_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef' } }],
};

// Circle layers only: the inline style has no glyphs, so symbol layers are skipped.
const CIRCLE_LAYERS = [
  'zones-visitor-clusters',
  'zones-visitor-points',
  'zones-resident-clusters',
  'zones-resident-points',
];

declare global {
  interface Window {
    __opened: string[];
    __bzaMap?: MapLibreMap;
  }
}

async function renderedFeatureCount(page: Page): Promise<number> {
  return page.evaluate((layers) => {
    const m = window.__bzaMap;
    return m ? m.queryRenderedFeatures(undefined, { layers }).length : 0;
  }, CIRCLE_LAYERS);
}

async function waitMapIdle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const m = window.__bzaMap;
        if (!m) return resolve();
        m.once('idle', () => resolve());
        m.triggerRepaint();
      }),
  );
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ path, fullPage: true });
  const dir = process.env.SCREENSHOT_DIR;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    copyFileSync(path, join(dir, name));
  }
}

test('tried zone is excluded after reload and next zone', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
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

  await page.goto('/?e2e');
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
  await expect.poll(() => renderedFeatureCount(page)).toBeGreaterThan(0);
  await waitMapIdle(page);
  await screenshot(page, testInfo, 'e2e-after-around-me.png');

  await cards.first().getByRole('button', { name: 'Go' }).click();
  await page.getByRole('button', { name: 'Google Maps' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__opened[0] ?? ''))
    .toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);

  await page.reload();
  const dialog = page.getByRole('dialog', { name: 'Found a spot?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'No, next zone' }).click();

  await expect(cards).toHaveCount(3);
  await expect(page.locator(`.cards > li[data-zone-id="${firstId}"]`)).toHaveCount(0);
  await expect(map).toHaveAttribute('data-tried-count', '1');
  await expect.poll(() => renderedFeatureCount(page)).toBeGreaterThan(0);
  await waitMapIdle(page);
  await screenshot(page, testInfo, 'e2e-after-next-zone.png');

  // Tried-zone styling (`tried: true` on rendered points) is not asserted: at the
  // current zoom nearly all features are clustered, so it cannot be checked reliably.
  expect(errors.filter((e) => /Worker failed to load/i.test(e))).toEqual([]);
});
