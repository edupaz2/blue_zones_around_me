import { expect, test } from '@playwright/test';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { EMPTY_STYLE } from './helpers';

// Close to zone 91b956e4df58 (see playwright.config.ts), so the search has results.
const SPOT = { lat: 40.4372, lng: -3.6545 };
const STREET = 'Calle de Alcalá 123';
const ADDRESS = `${STREET}, Madrid`; // the label builder appends the city
const LONG_ADDRESS =
  'Edificio de Oficinas Administrativas del Ayuntamiento de Madrid, Calle de Alcalá 123, ' +
  'Barrio de Salamanca, Distrito Salamanca, Madrid';

type Box = { x: number; y: number; width: number; height: number };
async function box(l: Locator): Promise<Box> {
  const b = await l.boundingBox();
  expect(b).not.toBeNull();
  return b!;
}

function photonReverse(name: string) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [SPOT.lng, SPOT.lat] },
        properties: { name, city: 'Madrid' },
      },
    ],
  };
}

/** Stubs tiles and the reverse geocoder; `stub.delayMs` delays the answer. */
async function open(page: Page, stub: { name: string; delayMs: number; requests: string[] }) {
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill({ json: EMPTY_STYLE }),
  );
  await page.route('https://photon.komoot.io/reverse**', async (route) => {
    stub.requests.push(route.request().url());
    if (stub.delayMs) await new Promise((r) => setTimeout(r, stub.delayMs));
    // The page may have aborted the request meanwhile.
    await route.fulfill({ json: photonReverse(stub.name) }).catch(() => {});
  });
  await page.goto('/?e2e');
  await page.locator('[data-testid="app-ready"]').waitFor();
  await page.evaluate(({ lat, lng }) => {
    const map = (window as unknown as { __bzaMap: import('maplibre-gl').Map }).__bzaMap;
    map.jumpTo({ center: [lng, lat], zoom: 15 });
  }, SPOT);
  await settled(page);
}

async function settled(page: Page) {
  await page.waitForFunction(() => {
    const map = (window as unknown as { __bzaMap: import('maplibre-gl').Map }).__bzaMap;
    return !map.isMoving() && map.loaded();
  });
}

async function project(page: Page, p = SPOT) {
  return page.evaluate(({ lat, lng }) => {
    const map = (window as unknown as { __bzaMap: import('maplibre-gl').Map }).__bzaMap;
    const pt = map.project([lng, lat]);
    const r = map.getContainer().getBoundingClientRect();
    return { x: r.left + pt.x, y: r.top + pt.y };
  }, p);
}

async function longPress(page: Page) {
  const { x, y } = await project(page);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
}

const header = (page: Page) => page.locator('.panel-header');
const address = (page: Page) => page.locator('.panel-address');

async function checkLayout(page: Page, names: { close: string; go: string }) {
  const head = await box(header(page));
  expect(head.height).toBeGreaterThanOrEqual(48);
  const close = await box(page.getByRole('button', { name: names.close }));
  expect(close.width).toBeGreaterThanOrEqual(48);
  expect(close.height).toBeGreaterThanOrEqual(48);
  const addr = await box(address(page));
  expect(addr.x + addr.width).toBeLessThanOrEqual(close.x + 0.5);
  expect(addr.x).toBeGreaterThanOrEqual(head.x);
  const firstCard = await box(page.locator('.cards > li').first());
  expect(head.y + head.height).toBeLessThanOrEqual(firstCard.y + 0.5);
  expect(addr.y + addr.height).toBeLessThanOrEqual(head.y + head.height + 0.5);
  const panel = await box(page.locator('section.panel'));
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.y + panel.height).toBeLessThanOrEqual(844);
  for (const go of await page.getByRole('button', { name: names.go, exact: true }).all()) {
    const g = await box(go);
    expect(g.x + g.width).toBeLessThanOrEqual(390);
  }
}

test('long-press shows the address and a red pin; closing removes both', async ({
  page,
}, testInfo: TestInfo) => {
  const stub = { name: STREET, delayMs: 0, requests: [] as string[] };
  await open(page, stub);
  const pin = page.locator('[role="img"][aria-label="Destination"]');
  await expect(pin).toHaveCount(0);

  await longPress(page);
  await expect(page.locator('.cards > li[data-zone-id]').first()).toBeVisible();
  await expect(address(page)).toHaveText(ADDRESS);
  await expect(pin).toBeVisible();
  await settled(page);

  // Exactly one reverse request, for the pressed point.
  expect(stub.requests).toHaveLength(1);
  const url = new URL(stub.requests[0]!);
  expect(url.pathname).toBe('/reverse');
  expect(Number(url.searchParams.get('lat'))).toBeCloseTo(SPOT.lat, 3);
  expect(Number(url.searchParams.get('lon'))).toBeCloseTo(SPOT.lng, 3);
  expect(url.searchParams.get('limit')).toBe('1');

  // The pin tip (bottom centre of the marker) is on the destination point.
  const target = await project(page);
  const pb = await box(pin);
  expect(Math.abs(pb.x + pb.width / 2 - target.x)).toBeLessThanOrEqual(20);
  expect(Math.abs(pb.y + pb.height - target.y)).toBeLessThanOrEqual(20);
  expect(await pin.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
  expect(await pin.evaluate((el) => el.innerHTML.toLowerCase())).toContain('#d32f2f');

  await checkLayout(page, { close: 'Close results', go: 'Go' });
  await page.screenshot({ path: testInfo.outputPath('pin-address-en.png') });

  await page.getByRole('button', { name: 'Close results' }).click();
  await expect(pin).toHaveCount(0);
  await expect(header(page)).toHaveCount(0);
  await expect(address(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Around me' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('pin-closed-en.png') });
});

test('a reverse answer arriving after closing never shows an address or pin', async ({ page }) => {
  const stub = { name: STREET, delayMs: 1000, requests: [] as string[] };
  await open(page, stub);
  await longPress(page);
  await expect(page.getByRole('button', { name: 'Close results' })).toBeVisible();
  await expect(page.locator('[role="img"][aria-label="Destination"]')).toBeVisible();
  await expect(address(page)).toHaveText('Selected point');
  await page.getByRole('button', { name: 'Close results' }).click();
  await page.waitForTimeout(1600);
  expect(stub.requests).toHaveLength(1);
  await expect(address(page)).toHaveCount(0);
  await expect(page.locator('[role="img"][aria-label="Destination"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Around me' })).toBeVisible();
});

test('a very long address is clamped to two lines without overlap', async ({
  page,
}, testInfo: TestInfo) => {
  const stub = { name: LONG_ADDRESS, delayMs: 0, requests: [] as string[] };
  await open(page, stub);
  await longPress(page);
  await expect(address(page)).toContainText('Edificio de Oficinas');
  await settled(page);
  const addr = await box(address(page));
  expect(addr.height).toBeLessThanOrEqual(2 * 14 * 1.25 + 1);
  await checkLayout(page, { close: 'Close results', go: 'Go' });
  await page.screenshot({ path: testInfo.outputPath('pin-long-address-en.png') });
});

test.describe('Spanish', () => {
  test.use({ locale: 'es-ES' });

  test('the Spanish pin name and layout', async ({ page }, testInfo: TestInfo) => {
    const stub = { name: LONG_ADDRESS, delayMs: 0, requests: [] as string[] };
    await open(page, stub);
    await longPress(page);
    await expect(page.locator('[role="img"][aria-label="Destino"]')).toBeVisible();
    await expect(address(page)).toContainText('Edificio de Oficinas');
    await settled(page);
    await checkLayout(page, { close: 'Cerrar resultados', go: 'Ir' });
    await page.screenshot({ path: testInfo.outputPath('pin-address-es.png') });
    await page.getByRole('button', { name: 'Cerrar resultados' }).click();
    await expect(page.locator('[role="img"][aria-label="Destino"]')).toHaveCount(0);
  });
});
