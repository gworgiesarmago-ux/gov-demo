import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import JSZip from 'jszip';

const routes = ['index.html', 'welcome.html', 'roadmap.html', 'login.html', 'register.html', 'verify.html', 'clearances.html', 'apply.html', 'vault.html'];
const protectedRoutes = ['roadmap.html', 'clearances.html', 'apply.html', 'vault.html'];
const visit = async (page, route = 'index.html') => {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#site-header')).toBeVisible();
};
const pdf = name => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% SugboStart test fixture\n%%EOF') });
const photo = { name: 'owner-photo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=', 'base64') };

async function enterDemo(page) {
  await visit(page);
  await page.locator('[data-action="explore-demo"]').click();
  await expect(page).toHaveURL(/roadmap\.html$/);
}

async function attach(page, kind, file = pdf(kind + '.pdf'), selector = null) {
  const pending = page.waitForEvent('filechooser');
  await page.locator(selector || `[data-action="upload-slot"][data-kind="${kind}"]`).click();
  await (await pending).setFiles(file);
  await expect(page.locator('#app-toast')).toContainText(file.name + ' attached locally');
}

async function attachRequired(page) {
  for (const kind of ['dti', 'lease', 'cedula']) await attach(page, kind);
  await attach(page, 'photo', photo);
  await expect(page.locator('#document-count')).toHaveText('4 of 4 required attachments uploaded');
}

async function downloadFrom(page, trigger) {
  const pending = page.waitForEvent('download');
  await trigger.click();
  const result = await pending;
  return {name: result.suggestedFilename(), data: await readFile(await result.path())};
}

function expectBlankPdf(data) {
  const source = data.toString('latin1');
  expect(source.startsWith('%PDF-')).toBeTruthy();
  expect(source.trimEnd().endsWith('%%EOF')).toBeTruthy();
  const pages = [...source.matchAll(/\d+ 0 obj\s*<<([\s\S]*?)>>\s*endobj/g)]
    .filter(match => /\/Type\s*\/Page\b/.test(match[1]));
  expect(pages).toHaveLength(1);
  const reference = pages[0][1].match(/\/Contents\s+(\d+)\s+0\s+R/);
  expect(reference).not.toBeNull();
  const stream = source.match(new RegExp(`\\b${reference[1]} 0 obj\\s*<<([\\s\\S]*?)>>\\s*stream\\r?\\n([\\s\\S]*?)\\r?\\nendstream`));
  expect(stream).not.toBeNull();
  const content = /\/FlateDecode\b/.test(stream[1])
    ? inflateSync(Buffer.from(stream[2], 'latin1')).toString('latin1')
    : stream[2];
  // Graphics-state setup may remain, but text, images, and painting must not.
  expect(content).not.toMatch(/(?:^|\s)(?:BT|Tj|TJ|Do|BI|sh|S|s|f\*?|F|B\*?|b\*?)(?=\s|$)/);
}

test('entry animates once per session and keeps account actions available on mobile', async ({ page }) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.emulateMedia({reducedMotion: 'no-preference'});
  const start = new Date('2026-10-29T02:00:00Z');
  await page.clock.install({time: start});
  await page.clock.pauseAt(start);
  await visit(page);
  await expect(page.locator('#startup-screen')).toBeVisible();
  await expect(page.locator('#startup-screen')).toHaveAttribute('role', 'status');
  await page.clock.runFor(2000);
  await expect(page.locator('#startup-screen')).toHaveCount(0);
  for (const name of ['Create Business Account', 'Sign In to Existing Account']) {
    await expect(page.getByRole('button', {name, exact: true})).toBeInViewport({ratio: 1});
  }
  await visit(page, 'welcome.html');
  await expect(page.locator('#startup-screen')).toHaveCount(0);
  await expect(page.locator('nav')).toHaveCount(0);
});

test('reduced motion and permit lookup skip the introductory delay', async ({ page }) => {
  await visit(page);
  await expect(page.locator('#startup-screen')).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Create Business Account', exact: true})).toBeVisible();
  await page.evaluate(() => sessionStorage.clear());
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await visit(page, 'welcome.html?permit=DEMO-SAMPLE');
  await expect(page.locator('#startup-screen')).toHaveCount(0);
});

test('protected pages require a demo session and exploration starts one', async ({ page }) => {
  for (const route of protectedRoutes) {
    await visit(page, route);
    await expect(page).toHaveURL(/(?:index|welcome|login)\.html$/);
  }
  await enterDemo(page);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('sugbo:session')).mode)).toBe('demo');
});

test('all screens fit desktop and mobile without script errors or missing local images', async ({ page }) => {
  test.setTimeout(90000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await enterDemo(page);
  for (const width of [1280, 390]) {
    await page.setViewportSize({width, height: 844});
    for (const route of routes) {
      await visit(page, route);
      await expect(page.locator('main')).toBeVisible();
      await expect(page).toHaveTitle(/SugboStart/);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), {message: `${route} overflows at ${width}px`}).toBeLessThanOrEqual(1);
      await expect.poll(() => page.locator('img').evaluateAll(images => images.filter(image => !image.complete || !image.naturalWidth).map(image => image.src)), {message: `${route} contains an unloaded image`}).toEqual([]);
      expect(await page.locator('img').evaluateAll(images => images.filter(image => !image.src.startsWith(location.origin) && !image.src.startsWith('data:') && !image.src.startsWith('blob:')).map(image => image.src))).toEqual([]);
    }
  }
  expect(errors).toEqual([]);
});

test('navigation retains the deployment path and uses active states', async ({ page }) => {
  await enterDemo(page);
  const directory = new URL('.', page.url()).pathname;
  for (const [name, route] of [['Clearances', 'clearances.html'], ['Apply', 'apply.html'], ['Vault', 'vault.html'], ['Roadmap', 'roadmap.html']]) {
    await page.locator('nav').getByRole('link', {name, exact: true}).click();
    expect(new URL(page.url()).pathname).toBe(directory + route);
    await expect(page.locator('nav').getByRole('link', {name, exact: true})).toHaveAttribute('aria-current', 'page');
  }
  for (const route of routes) {
    await visit(page, route);
    const absoluteLocalPaths = await page.locator('[href],[src]').evaluateAll(nodes => nodes.flatMap(node => ['href', 'src'].map(attribute => node.getAttribute(attribute))).filter(value => value?.startsWith('/') && !value.startsWith('//') && !value.startsWith('/@vite/')));
    expect(absoluteLocalPaths, `${route} must work below a path prefix`).toEqual([]);
  }
});

test('welcome links and login use accessible mobile autofill hints', async ({ page }) => {
  await visit(page);
  await page.getByRole('button', {name: 'Create Business Account', exact: true}).click();
  await expect(page).toHaveURL(/register\.html$/);
  await visit(page, 'welcome.html');
  await page.getByRole('button', {name: 'Sign In to Existing Account', exact: true}).click();
  await expect(page.locator('#identifier')).toHaveAttribute('autocomplete', 'username');
  await expect(page.locator('#password')).toHaveAttribute('autocomplete', 'current-password');
  await page.locator('#identifier').fill('maria@example.com');
  await page.locator('#password').fill('Demo12345');
  await page.getByRole('button', {name: 'Sign In to SugboStart', exact: true}).click();
  await expect(page).toHaveURL(/roadmap\.html$/);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('sugbo:session')).mode)).toBe('demo');
  expect(await page.evaluate(() => JSON.stringify({...localStorage, ...sessionStorage}))).not.toContain('Demo12345');
});

test('empty document progress is honest and review is blocked without required uploads', async ({ page }) => {
  await enterDemo(page);
  await visit(page, 'apply.html');
  await expect(page.locator('#document-count')).toHaveText('0 of 4 required attachments uploaded');
  await expect(page.locator('#document-status')).toHaveText('Documents needed');
  await expect(page.locator('[data-document-kind]')).toHaveCount(4);
  await page.locator('#submit-btn').click();
  await expect(page.locator('#required-documents-error')).toContainText('Attach all required documents');
  await expect(page.locator('#error-summary')).toBeVisible();
  await expect(page.locator('#application-review')).toHaveCount(0);
});

test('upload signatures reject spoofed PDF and accept content without a MIME type', async ({ page }) => {
  await enterDemo(page);
  await visit(page, 'apply.html');
  const pending = page.waitForEvent('filechooser');
  await page.locator('[data-action="upload-slot"][data-kind="dti"]').click();
  await (await pending).setFiles({name: 'pretend.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<script>not a PDF</script>')});
  await expect(page.locator('#app-toast')).toContainText('file content must be a PDF, JPEG, or PNG');
  await expect(page.locator('#document-count')).toHaveText('0 of 4 required attachments uploaded');
  await attach(page, 'dti', {...pdf('genuine.pdf'), mimeType: ''});
  await expect(page.locator('#document-count')).toHaveText('1 of 4 required attachments uploaded');
});

test('lease and supplemental uploads persist independently and removal updates progress', async ({ page }) => {
  await enterDemo(page);
  await visit(page, 'clearances.html');
  await attach(page, 'lease', pdf('lease-contract.pdf'), '[data-action="attach-lease"]');
  await expect(page.locator('#lease-status')).toContainText('Attached locally');
  await page.reload({waitUntil: 'domcontentloaded'});
  await expect(page.locator('#lease-status')).toContainText('Attached locally');
  await visit(page, 'apply.html');
  await expect(page.locator('[data-document-kind="lease"]')).toContainText('lease-contract.pdf');
  await attach(page, 'supplemental', pdf('supporting-record.pdf'));
  await page.reload({waitUntil: 'domcontentloaded'});
  await expect(page.locator('#document-list')).toContainText('supporting-record.pdf');
  await expect(page.locator('#document-count')).toHaveText('1 of 4 required attachments uploaded');
  await page.locator('[data-document-kind="lease"] [data-action="delete-upload"]').click();
  await expect(page.locator('#document-count')).toHaveText('0 of 4 required attachments uploaded');
  await expect(page.locator('#document-list')).toContainText('supporting-record.pdf');
});

test('fixed demo fees and saved application draft persist across reloads', async ({ page }) => {
  await enterDemo(page);
  await visit(page, 'apply.html');
  await expect(page.locator('#total-fee-display')).toContainText('450');
  await page.locator('#employees-count').fill('12');
  await page.locator('#capitalization-amount').fill('250,000.50');
  await page.locator('input[value="pickup"]').check();
  await expect(page.locator('#total-fee-display')).toContainText('300');
  await page.locator('#draft-btn').click();
  await expect(page.locator('#app-toast')).toContainText('Draft saved');
  await page.reload({waitUntil: 'domcontentloaded'});
  await expect(page.locator('#employees-count')).toHaveValue('12');
  await expect(page.locator('#capitalization-amount')).toHaveValue('250,000.50');
  await expect(page.locator('input[value="pickup"]')).toBeChecked();
  await expect(page.locator('#total-fee-display')).toContainText('300');
  await page.locator('input[value="express"]').check();
  await expect(page.locator('#total-fee-display')).toContainText('450');
});

test('invalid application values present an error summary and linked field alerts', async ({ page }) => {
  await enterDemo(page);
  await visit(page, 'apply.html');
  await page.locator('#employees-count').fill('-2');
  await page.locator('#capitalization-amount').fill('0');
  await page.locator('#submit-btn').click();
  await expect(page.locator('#employees-count')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#capitalization-amount')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#employees-count-error')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#error-summary')).toBeFocused();
  await expect(page.locator('#application-review')).toHaveCount(0);
});

test('complete attachments advance to review then persist a locked unique submission', async ({ page }) => {
  await enterDemo(page);
  await visit(page, 'apply.html');
  await attachRequired(page);
  await page.locator('#submit-btn').click();
  await expect(page.locator('#application-review')).toBeVisible();
  await expect(page.locator('#application-step-label')).toHaveText('Step 3 of 3');
  await expect(page.locator('#application-form')).toBeHidden();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.locator('#edit-application-btn').click();
  await expect(page.locator('#application-step-label')).toHaveText('Step 2 of 3');
  await page.locator('#employees-count').fill('7');
  await page.locator('#submit-btn').click();
  await page.locator('#confirm-submission-btn').click();
  await expect(page.locator('#application-submitted')).toBeVisible();
  const reference = await page.locator('#submitted-reference').textContent();
  expect(reference).toMatch(/DEMO-[A-F0-9]{8}-[A-F0-9]{4}-4[A-F0-9]{3}-[89AB][A-F0-9]{3}-[A-F0-9]{12}/);
  await expect(page.locator('#employees-count')).toBeDisabled();
  await expect(page.locator('#application-actions')).toBeHidden();
  for (const control of await page.locator('#document-list [data-action="upload-slot"], #document-list [data-action="delete-upload"]').all()) await expect(control).toBeDisabled();
  await page.reload({waitUntil: 'domcontentloaded'});
  await expect(page.locator('#submitted-reference')).toHaveText(reference);
  await expect(page.locator('#employees-count')).toHaveValue('7');
  await expect(page.locator('#employees-count')).toBeDisabled();
  await page.locator('[data-document-kind="dti"] [data-action="view-upload"]').click();
  await expect(page.getByRole('dialog')).toContainText('dti.pdf');
});

test('registration validates required fields and mismatched passwords', async ({ page }) => {
  await visit(page, 'register.html');
  await page.locator('#submitBtn').click();
  for (const field of ['firstName', 'email', 'termsConsent']) await expect(page.locator('#' + field)).toHaveAttribute('aria-invalid', 'true');
  await page.locator('#password').fill('Secure123');
  await page.locator('#confirmPassword').fill('Different123');
  await page.locator('#submitBtn').click();
  await expect(page.locator('#confirmPassword-error')).toContainText(/match/i);
  await expect(page.locator('#error-summary')).toBeVisible();
  await expect(page).toHaveURL(/register\.html$/);
});

test('verified registration carries the entered profile through dashboard and account', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await visit(page, 'register.html');
  for (const [id, value] of Object.entries({firstName: 'Isabel', middleName: 'Santos', lastName: 'Reyes', mobileNumber: '9187654321', email: 'isabel@example.com', password: 'Secure123', confirmPassword: 'Secure123', businessName: 'Isabel Coffee House', address: 'Lahug, Cebu City'})) await page.locator('#' + id).fill(value);
  await page.locator('#entityType').selectOption({index: 1});
  await page.locator('#lguLocation').selectOption({index: 1});
  await page.locator('#termsConsent').check();
  await page.locator('#perjuryCert').check();
  await page.locator('#submitBtn').click();
  await expect(page).toHaveURL(/verify\.html$/);
  await expect(page.locator('.otp-box').first()).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(page.locator('main')).toContainText('9187654321');
  await page.evaluate(() => navigator.clipboard.writeText('729123'));
  await page.locator('.otp-box').first().focus();
  await page.keyboard.press('Control+V');
  for (let index = 0; index < 6; index++) await expect(page.locator('.otp-box').nth(index)).toHaveValue('729123'[index]);
  await page.locator('[data-action="scan-identity"]').click();
  await page.getByRole('button', {name: 'Use demo identity', exact: true}).click();
  await page.locator('[data-action="complete-verification"]').click();
  await expect(page).toHaveURL(/roadmap\.html$/);
  await expect(page.locator('main')).toContainText('Isabel');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sugbo:profile')));
  expect(saved).toMatchObject({firstName: 'Isabel', middleName: 'Santos', lastName: 'Reyes', mobileNumber: '9187654321', email: 'isabel@example.com', businessName: 'Isabel Coffee House', address: 'Lahug, Cebu City'});
  expect(saved).not.toHaveProperty('password');
  expect(await page.evaluate(() => sessionStorage.getItem('sugbo:onboarding'))).toBeNull();
  await page.getByRole('button', {name: 'Open account menu', exact: true}).click();
  await expect(page.getByRole('dialog')).toContainText('Isabel');
  await expect(page.getByRole('dialog')).toContainText('Reyes');
  await expect(page.getByRole('dialog')).toContainText('Isabel Coffee House');
  await visit(page, 'apply.html');
  await expect(page.locator('#entity-name')).toHaveText('Isabel Coffee House');
  await expect(page.locator('#entity-address')).toHaveText('Lahug, Cebu City');
});

test('resend code enforces a cooldown and invalid OTP does not start a session', async ({ page }) => {
  await page.clock.install();
  await visit(page, 'verify.html');
  await expect(page.locator('#resend-code')).toBeDisabled();
  await page.clock.runFor(31000);
  await expect(page.locator('#resend-code')).toBeEnabled();
  await page.locator('#resend-code').click();
  await expect(page.locator('#resend-code')).toBeDisabled();
  await page.reload({waitUntil: 'domcontentloaded'});
  await expect(page.locator('#resend-code')).toBeDisabled();
  await page.clock.runFor(31000);
  await expect(page.locator('#resend-code')).toBeEnabled();
  await page.locator('[data-action="complete-verification"]').click();
  await expect(page).toHaveURL(/verify\.html$/);
  expect(await page.evaluate(() => sessionStorage.getItem('sugbo:session'))).toBeNull();
});

test('document downloads provide blank single-page PDFs with distinct filenames', async ({ page }) => {
  await enterDemo(page);
  await visit(page, 'vault.html');
  await expect(page.getByRole('heading', {name: 'Your document vault is empty', exact: true})).toBeVisible();
  const names = [];
  for (const [route, kind] of [['vault.html', 'dti'], ['clearances.html', 'cedula']]) {
    await visit(page, route);
    await page.locator(`[data-action="preview-document"][data-document="${kind}"]`).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('This document is blank for now.');
    const file = await downloadFrom(page, page.getByRole('button', {name: 'Download blank PDF', exact: true}));
    names.push(file.name);
    expect(file.name).toMatch(/\.pdf$/);
    expectBlankPdf(file.data);
    await expect(page.locator('#dialog-toast')).toBeVisible();
    await expect(page.locator('#dialog-toast')).toContainText('download');
    await page.keyboard.press('Escape');
  }
  expect(new Set(names).size).toBe(2);
});

test('vault QR dialog renders an image and closes using Escape', async ({ page }) => {
  await enterDemo(page);
  await visit(page, 'vault.html');
  await page.locator('[data-action="qr"]').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect.poll(() => page.getByRole('dialog').locator('img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('calendar exports future dated reminders with generation stamps and alarms', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-29T02:03:04Z'));
  await enterDemo(page);
  await visit(page, 'vault.html');
  const file = await downloadFrom(page, page.locator('[data-action="calendar"]'));
  expect(file.name).toMatch(/\.ics$/);
  const content = file.data.toString();
  const dates = [...content.matchAll(/DTSTART;VALUE=DATE:(\d{8})/g)].map(match => match[1]);
  expect(dates).toHaveLength(3);
  for (const date of dates) expect(date > '20261029').toBeTruthy();
  expect(content.match(/DTSTAMP:20261029T020304Z/g)).toHaveLength(3);
  expect(content.match(/BEGIN:VALARM/g)).toHaveLength(3);
});

test('compliance packet contains five blank PDFs and clear placeholder instructions', async ({ page }) => {
  await enterDemo(page);
  await visit(page, 'vault.html');
  const file = await downloadFrom(page, page.locator('[data-action="export-packet"]'));
  expect(file.name).toMatch(/\.zip$/i);
  const zip = await JSZip.loadAsync(file.data);
  const names = Object.keys(zip.files);
  const documents = names.filter(name => name.startsWith('samples/') && name.endsWith('.pdf'));
  expect(documents).toHaveLength(5);
  for (const name of documents) expectBlankPdf(await zip.file(name).async('nodebuffer'));
  expect(await zip.file('README.txt').async('string')).toMatch(/blank/i);
  expect(names.some(name => name.includes('node_modules') || name.startsWith('dist/'))).toBeFalsy();
});


