import { expect, test } from '@playwright/test';
import { EMPTY_STYLE } from './helpers';

// The preview server runs on localhost, where analytics must stay off: no
// script in the DOM and no request to GoatCounter, even through a full flow.
for (const url of ['/', '/?e2e']) {
  test(`no analytics script or request on localhost (${url})`, async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.route('https://tiles.openfreemap.org/**', (route) =>
      route.fulfill({ json: EMPTY_STYLE }),
    );
    await page.goto(url);
    await page.locator('[data-testid="app-ready"]').waitFor();
    await page.getByRole('button', { name: 'Around me' }).click();
    await expect(page.locator('.cards > li[data-zone-id]')).toHaveCount(3);
    await page.getByRole('button', { name: 'Close results' }).click();
    await expect(page.locator('script[data-goatcounter]')).toHaveCount(0);
    expect(requests.filter((u) => /gc\.zgo\.at|goatcounter/i.test(u))).toEqual([]);
  });
}
