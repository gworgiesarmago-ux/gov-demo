import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const protectedRoutes = new Set(['roadmap', 'clearances', 'apply', 'vault']);
const routes = ['index', 'login', 'register', 'verify', 'roadmap', 'clearances', 'apply', 'vault'];

for (const width of [390, 1280]) {
  for (const route of routes) {
    test(`${route} meets automated accessibility checks at ${width}px`, async ({ page }) => {
      test.setTimeout(60000);
      await page.setViewportSize({width, height: 900});
      if (protectedRoutes.has(route)) {
        await page.goto('index.html', {waitUntil: 'domcontentloaded'});
        await page.locator('[data-action="explore-demo"]').click();
        await expect(page).toHaveURL(/roadmap\.html$/);
      }
      await page.goto(`${route}.html`, {waitUntil: 'domcontentloaded'});
      await expect(page.locator('#site-header')).toBeVisible();
      await page.waitForLoadState('load');
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('main')).toBeVisible();
      if (route === 'apply') await expect(page.locator('#document-count')).toHaveText('0 of 4 required attachments uploaded');
      const result = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(result.violations.map(({id, impact, nodes}) => ({id, impact, nodes: nodes.map(({target, failureSummary}) => ({target, failureSummary}))}))).toEqual([]);
    });
  }
}

test('invalid registration is accessible and field errors are associated with controls', async ({ page }) => {
  await page.goto('register.html', {waitUntil: 'domcontentloaded'});
  await page.locator('#submitBtn').click();
  await expect(page.locator('#error-summary')).toBeVisible();
  await expect(page.locator('#firstName')).toHaveAttribute('aria-describedby', /firstName-error/);
  const result = await new AxeBuilder({page}).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations).toEqual([]);
});
