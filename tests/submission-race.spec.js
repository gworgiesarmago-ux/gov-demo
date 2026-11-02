import {test, expect} from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.addInitScript(() => sessionStorage.setItem('sugbo:session', JSON.stringify({mode:'demo', startedAt: new Date().toISOString()})));
  await page.goto('apply.html');
  await expect(page.locator('#document-count')).toContainText('0 of 4');
});

test('an upload queued behind submission cannot change the locked attachments', async ({page}) => {
  await page.evaluate(async () => {
    await new Promise(resolve => navigator.locks.request('sugbostart-demo-submission', () => {
      resolve();
      return new Promise(release => { window.releaseDemoLock = release; });
    }));
  });
  const picker = page.waitForEvent('filechooser');
  await page.locator('[data-kind="dti"]').click();
  await (await picker).setFiles({name:'pending.pdf', mimeType:'application/pdf', buffer:Buffer.from('%PDF-1.4\n%%EOF')});
  try {
    await page.waitForTimeout(200);
    const count = await page.evaluate(async () => (await (await import('./src/uploads.js')).files()).length);
    expect(count).toBe(0);
    await page.evaluate(() => {
      localStorage.setItem('sugbo:submitted', JSON.stringify({reference:'DEMO-LOCKED'}));
      window.releaseDemoLock();
    });
    await expect(page.locator('#app-toast')).toContainText('locked');
    expect(await page.evaluate(async () => (await (await import('./src/uploads.js')).files()).length)).toBe(0);
  } finally { await page.evaluate(() => window.releaseDemoLock?.()); }
});

test('confirmation requires a fresh review after attachments change in another tab', async ({page}) => {
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('sugbostart-documents', 1);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('files','readwrite');
      for (const kind of ['dti','lease','cedula','photo']) {
        const blob = new Blob(['%PDF-1.4 demo']);
        tx.objectStore('files').put({id:kind,kind,name:kind+'.pdf',type:'application/pdf',size:blob.size,blob,uploadedAt:'2026-10-30T00:00:00Z'});
      }
      tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error);
    });
    db.close();
    await (await import('./src/uploads.js')).renderUploads();
  });
  await page.locator('#employees-count').fill('2');
  await page.locator('#capitalization-amount').fill('10000');
  await page.locator('#submit-btn').click();
  await expect(page.locator('#application-review')).toBeVisible();
  await page.evaluate(async () => {
    const db = await new Promise(resolve => {const request=indexedDB.open('sugbostart-documents',1);request.onsuccess=()=>resolve(request.result);});
    await new Promise(resolve => {
      const tx=db.transaction('files','readwrite'); const request=tx.objectStore('files').get('dti');
      request.onsuccess=()=>tx.objectStore('files').put({...request.result,name:'replacement.pdf',uploadedAt:'2026-10-30T00:01:00Z'});
      tx.oncomplete=resolve;
    });
    db.close();
  });
  await page.locator('#confirm-submission-btn').click();
  await expect(page.locator('#application-form')).toBeVisible();
  await expect(page.locator('#app-toast')).toContainText('changed');
  expect(await page.evaluate(()=>localStorage.getItem('sugbo:submitted'))).toBeNull();
});
