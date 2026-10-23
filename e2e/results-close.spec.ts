import { expect, test } from '@playwright/test';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { EMPTY_STYLE } from './helpers';

type Box = { x: number; y: number; width: number; height: number };

function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

async function open(page: Page, aroundName: string) {
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill({ json: EMPTY_STYLE }),
  );
  await page.goto('/?e2e');
  await page.locator('[data-testid="app-ready"]').waitFor();
  await page.getByRole('button', { name: aroundName }).click();
  await expect(page.locator('.cards > li[data-zone-id]')).toHaveCount(3);
}

async function expectNoOverlap(
  page: Page,
  names: { close: string; go: string; settings: string; recenter: string },
) {
  const close = await box(page.getByRole('button', { name: names.close }));
  expect(close.width).toBeGreaterThanOrEqual(48);
  expect(close.height).toBeGreaterThanOrEqual(48);
  const others = [
    page.locator(`button[aria-label="${names.recenter}"]`),
    page.getByRole('button', { name: names.settings }),
    ...(await page.getByRole('button', { name: names.go, exact: true }).all()),
  ];
  for (const o of others) expect(intersects(close, await box(o))).toBe(false);
  // The panel is not clipped by the viewport.
  const panel = await box(page.getByRole('region').filter({ has: page.locator('.cards') }));
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.y + panel.height).toBeLessThanOrEqual(844);
  // Recenter sits clear above the whole bottom overlay.
  const overlay = await box(page.locator('[data-testid="overlay-bottom"]'));
  expect(intersects(await box(others[0]!), overlay)).toBe(false);
}

test('the results panel can be closed and a new search works', async ({ page }, testInfo) => {
  await open(page, 'Around me');
  await expect(page.getByRole('button', { name: 'Around me' })).toHaveCount(0);
  await expectNoOverlap(page, {
    close: 'Close results',
    go: 'Go',
    settings: 'Settings',
    recenter: 'Recenter',
  });
  await page.screenshot({ path: testInfo.outputPath('results-panel-en.png') });

  await page.getByRole('button', { name: 'Close results' }).click();
  await expect(page.locator('.cards > li[data-zone-id]')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Blue zones' })).toHaveCount(0);
  const around = page.getByRole('button', { name: 'Around me' });
  await expect(around).toBeVisible();
  await expect(around).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('results-panel-closed.png') });

  await around.click();
  await expect(page.locator('.cards > li[data-zone-id]')).toHaveCount(3);
});

test.describe('Spanish', () => {
  test.use({ locale: 'es-ES' });

  test('the close button fits the Spanish layout', async ({ page }, testInfo: TestInfo) => {
    await open(page, 'Cerca de mí');
    await expect(page.getByRole('button', { name: 'Cerca de mí' })).toHaveCount(0);
    await expectNoOverlap(page, {
      close: 'Cerrar resultados',
      go: 'Ir',
      settings: 'Ajustes',
      recenter: 'Recentrar',
    });
    await page.screenshot({ path: testInfo.outputPath('results-panel-es.png') });
  });
});
