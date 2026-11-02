import {test,expect} from '@playwright/test';

test('login preserves an identifier typed before the app finishes loading', async ({page}) => {
  let release;
  const held = new Promise(resolve => {release=resolve;});
  await page.route(/\/(?:src\/app\.js|assets\/app-[^/]+\.js)(?:\?|$)/, async route => {
    await held;
    await route.continue();
  });
  await page.goto('login.html', {waitUntil:'commit'});
  await page.locator('#identifier').fill('early@example.test');
  await page.locator('#password').fill('Demo12345');
  const nativeRequests=[];
  page.on('request', request => { if(request.isNavigationRequest()) nativeRequests.push(request.url()); });
  await page.evaluate(() => document.querySelector('form').requestSubmit());
  await page.waitForTimeout(150);
  expect(nativeRequests.filter(url => url.includes('Demo12345'))).toEqual([]);
  release();
  await expect(page.locator('#site-header')).toBeVisible();
  await expect(page.locator('#identifier')).toHaveValue('early@example.test');
  await page.locator('#password').fill('Demo12345');
  await page.getByRole('button',{name:'Sign In to SugboStart',exact:true}).click();
  await expect(page).toHaveURL(/roadmap\.html$/);
});
