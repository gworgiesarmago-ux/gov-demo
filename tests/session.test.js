import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const account = await import('../src/session.js').catch(() => ({}));
const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
};
let redirects;
beforeEach(() => {
  globalThis.localStorage = memoryStorage();
  globalThis.sessionStorage = memoryStorage();
  redirects = [];
  globalThis.location = { href: 'https://example.test/demo/roadmap.html', replace: url => redirects.push(url) };
});

test('profile persistence carries registration fields without storing credentials or unrelated input', () => {
  const data = Object.freeze({ firstName: ' Ana ', middleName: ' Maria ', lastName: ' Reyes ', mobileNumber: '9175551234', email: 'ana@example.test', entityType: 'Corporation', lguLocation: 'Cebu City', businessName: 'Ana Coffee', address: '12 Long Street', password: 'Secret1234', confirmPassword: 'Secret1234', termsConsent: true, unknown: 'ignore' });
  account.saveProfile(data);
  const saved = JSON.parse(localStorage.getItem('sugbo:profile'));
  assert.deepEqual(saved, { firstName: 'Ana', middleName: 'Maria', lastName: 'Reyes', mobileNumber: '9175551234', email: 'ana@example.test', entityType: 'Corporation', lguLocation: 'Cebu City', businessName: 'Ana Coffee', address: '12 Long Street' });
  assert.deepEqual(account.getProfile(), saved);
  assert.equal(data.firstName, ' Ana ');
});

test('profile reads recover from malformed storage and sanitize field types and lengths', () => {
  for (const invalid of ['broken-json', 'null', '[]', '42']) {
    localStorage.setItem('sugbo:profile', invalid);
    assert.equal(account.getProfile().firstName, 'Maria Clara');
  }
  assert.deepEqual(account.sanitizeProfile(null), {});
  assert.deepEqual(account.sanitizeProfile([]), {});
  assert.deepEqual(account.sanitizeProfile({ firstName: 42, lastName: 'x'.repeat(300) }), { lastName: 'x'.repeat(200) });
  const first = account.getProfile();
  first.firstName = 'Changed';
  assert.equal(account.getProfile().firstName, 'Maria Clara');
});

test('a demo session enables private pages and signing out removes transient account state', () => {
  assert.equal(account.isSignedIn(), false);
  assert.equal(account.startDemoSession({ firstName: 'Ana', lastName: 'Reyes' }), true);
  const session = JSON.parse(sessionStorage.getItem('sugbo:session'));
  assert.equal(session.mode, 'demo');
  assert.ok(Number.isFinite(Date.parse(session.startedAt)));
  assert.equal(account.isSignedIn(), true);
  assert.equal(account.guardPage('roadmap'), true);
  assert.equal(redirects.length, 0);
  sessionStorage.setItem('sugbo:onboarding', '{}');
  sessionStorage.setItem('sugbo:otpResendAt', '123');
  account.signOut();
  assert.equal(account.isSignedIn(), false);
  assert.equal(sessionStorage.getItem('sugbo:onboarding'), null);
  assert.equal(sessionStorage.getItem('sugbo:otpResendAt'), null);
  assert.equal(account.getProfile().firstName, 'Ana');
  assert.equal(redirects.at(-1), 'https://example.test/demo/welcome.html');
});

test('private routes require a valid demo session and preserve subpath hosting', () => {
  for (const page of ['roadmap', 'clearances', 'apply', 'vault']) assert.equal(account.guardPage(page), false);
  assert.deepEqual(redirects, Array(4).fill('https://example.test/demo/login.html'));
  for (const page of ['welcome', 'login', 'register', 'verify']) assert.equal(account.guardPage(page), true);
  for (const invalid of ['broken', 'null', 'true', '{}', '{"mode":"demo"}', '{"mode":"real","startedAt":"2026-10-30T00:00:00Z"}', '{"mode":"demo","startedAt":"invalid"}']) {
    sessionStorage.setItem('sugbo:session', invalid);
    assert.equal(account.isSignedIn(), false);
  }
});

test('exploring the demo stores a consistent profile for the application and sample exports', () => {
  account.startDemoSession();
  assert.deepEqual(JSON.parse(localStorage.getItem('sugbo:profile')), account.getProfile());
  account.saveProfile({firstName: 'Ana', lastName: 'Reyes', businessName: 'Ana Coffee'});
  account.startDemoSession();
  assert.equal(JSON.parse(localStorage.getItem('sugbo:profile')).businessName, 'Ana Coffee');
});

test('remembered identifiers expire at thirty days and legacy or corrupt records are removed', () => {
  const now = Date.parse('2026-10-30T00:00:00Z');
  const duration = 30 * 86400000;
  account.rememberIdentifier(' ana@example.test ', now);
  assert.equal(account.getRememberedIdentifier(now), 'ana@example.test');
  assert.equal(account.getRememberedIdentifier(now + duration - 1), 'ana@example.test');
  assert.equal(account.getRememberedIdentifier(now + duration), '');
  assert.equal(localStorage.getItem('sugbo:rememberedIdentifier'), null);
  for (const invalid of ['"legacy@example.test"', 'broken-json', '{}', '{"identifier":"x","expiresAt":"2026-11-01"}']) {
    localStorage.setItem('sugbo:rememberedIdentifier', invalid);
    assert.equal(account.getRememberedIdentifier(now), '');
    assert.equal(localStorage.getItem('sugbo:rememberedIdentifier'), null);
  }
  account.rememberIdentifier('ana@example.test', now);
  account.clearRememberedIdentifier();
  assert.equal(account.getRememberedIdentifier(now), '');
  account.rememberIdentifier(' ', now);
  assert.equal(account.getRememberedIdentifier(now), '');
});

test('unavailable browser storage fails closed without silently creating a session', () => {
  const unavailable = { getItem() { throw new Error('Storage denied'); }, setItem() { throw new Error('Storage denied'); }, removeItem() { throw new Error('Storage denied'); } };
  globalThis.localStorage = unavailable;
  globalThis.sessionStorage = unavailable;
  assert.equal(account.isSignedIn(), false);
  assert.equal(account.getProfile().firstName, 'Maria Clara');
  assert.equal(account.getRememberedIdentifier(), '');
  assert.throws(() => account.startDemoSession(), /Storage denied/);
  assert.throws(() => account.saveProfile({ firstName: 'Ana' }), /Storage denied/);
  assert.throws(() => account.signOut(), /Storage denied/);
});
