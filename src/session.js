const PROFILE_FIELDS = ['firstName', 'middleName', 'lastName', 'mobileNumber', 'email', 'entityType', 'lguLocation', 'businessName', 'address'];
const REMEMBER_DURATION = 30 * 24 * 60 * 60 * 1000;
const PRIVATE_PAGES = ['roadmap', 'clearances', 'apply', 'vault'];
const SAMPLE_PROFILE = Object.freeze({
  firstName: 'Maria Clara', middleName: '', lastName: 'Del Rosario',
  mobileNumber: '9171234567', email: 'maria@example.com',
  entityType: 'Sole Proprietorship', lguLocation: 'Cebu City',
  businessName: 'Sugbo Artisan Coffee & Bakeshop', address: 'Lahug, Cebu City',
});

function readLocal(key) {
  try { return JSON.parse(localStorage.getItem('sugbo:' + key)); }
  catch { return null; }
}

export function sanitizeProfile(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(PROFILE_FIELDS.filter(key => typeof value[key] === 'string')
    .map(key => [key, value[key].trim().slice(0, 200)]));
}

export function getProfile() {
  return { ...SAMPLE_PROFILE, ...sanitizeProfile(readLocal('profile')) };
}

export function saveProfile(value) {
  localStorage.setItem('sugbo:profile', JSON.stringify(sanitizeProfile(value)));
  return true;
}

// This flag coordinates the local demo flow; it is not authentication.
export function startDemoSession(profile) {
  saveProfile(profile || getProfile());
  sessionStorage.setItem('sugbo:session', JSON.stringify({ mode: 'demo', startedAt: new Date().toISOString() }));
  return true;
}

export function isSignedIn() {
  try {
    const session = JSON.parse(sessionStorage.getItem('sugbo:session'));
    return session?.mode === 'demo' && typeof session.startedAt === 'string' && Number.isFinite(Date.parse(session.startedAt));
  } catch { return false; }
}

export function guardPage(page) {
  if (!PRIVATE_PAGES.includes(page) || isSignedIn()) return true;
  location.replace(new URL('login.html', location.href).href);
  return false;
}

export function signOut() {
  sessionStorage.removeItem('sugbo:session');
  sessionStorage.removeItem('sugbo:onboarding');
  sessionStorage.removeItem('sugbo:otpResendAt');
  location.replace(new URL('welcome.html', location.href).href);
}

export function clearRememberedIdentifier() {
  localStorage.removeItem('sugbo:rememberedIdentifier');
  return true;
}

export function rememberIdentifier(identifier, now = Date.now()) {
  if (typeof identifier !== 'string' || !identifier.trim() || !Number.isFinite(now)) return clearRememberedIdentifier();
  localStorage.setItem('sugbo:rememberedIdentifier', JSON.stringify({ identifier: identifier.trim().slice(0, 254), expiresAt: now + REMEMBER_DURATION }));
  return true;
}

export function getRememberedIdentifier(now = Date.now()) {
  const remembered = readLocal('rememberedIdentifier');
  if (remembered && typeof remembered === 'object' && typeof remembered.identifier === 'string'
      && Number.isFinite(remembered.expiresAt) && remembered.expiresAt > now
      && remembered.expiresAt <= now + REMEMBER_DURATION) return remembered.identifier;
  try { clearRememberedIdentifier(); }
  catch { /* No usable identifier is exposed when storage is unavailable. */ }
  return '';
}
