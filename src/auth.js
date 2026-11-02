import { $, $$, go, toast, el, button, modal, closeModal, errors, bind } from './ui.js';
import { validateRegistration } from './domain.js';
import { sanitizeProfile, getProfile, startDemoSession, rememberIdentifier, getRememberedIdentifier, clearRememberedIdentifier } from './session.js';

const DEMO_CODE = '729123';
const RESEND_DELAY = 30000;
const LOGIN_PASSWORD_REQUIRED = 'Enter a password to try the demo.';
const safely = action => event => {
  try { return action(event); }
  catch (error) { console.error('Demo account action failed:', error); toast('Browser storage is unavailable. Allow storage and try again.'); }
};
const actions = (names, handler) => names.forEach(name => bind(name, safely(handler)));
const enterDemo = safely(() => { startDemoSession(); go('roadmap'); });

export function initAuth(page) {
  bind('toggle-password', event => togglePassword($('#' + event.currentTarget.dataset.target), event.currentTarget));
  actions(['register', 'create-account', 'register-link'], event => { event.preventDefault(); go('register'); });
  actions(['login', 'sign-in', 'signin-link'], event => { event.preventDefault(); go('login'); });
  bind('explore-demo', enterDemo);
  actions(['demo-terms', 'terms'], event => {
    event.preventDefault();
    modal('Demo terms & privacy', 'This prototype stores profile details, drafts and sample document uploads in this browser only. It does not connect to a government registry, create a real account, collect payments, or transmit credentials. Use example details. Clear demo data from the profile menu to remove saved records.');
  });
  if (page === 'login') setupLogin();
  if (page === 'register') setupRegister();
  if (page === 'verify') setupVerification();
}

function togglePassword(input, control) {
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
  const showing = input.type === 'text';
  control.setAttribute('aria-label', (showing ? 'Hide ' : 'Show ') + (input.id === 'confirmPassword' ? 'confirm password' : 'password'));
  control.setAttribute('aria-pressed', String(showing));
  control.textContent = showing ? 'Hide' : 'Show';
}

function setupLogin() {
  const form = $('form');
  form.noValidate = true;
  $('#identifier').autocomplete = 'username';
  $('#password').autocomplete = 'current-password';
  const remembered = getRememberedIdentifier();
  // Preserve input from typing or password managers while the bundle loads.
  if (!$('#identifier').value) {
    $('#identifier').value = remembered;
    $('#remember-device').checked = Boolean(remembered);
  }
  form.addEventListener('submit', safely(event => {
    event.preventDefault();
    const identifier = $('#identifier').value.trim();
    const password = $('#password').value;
    const validIdentifier = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier) || /^(?:\+63|0)?9\d{9}$/.test(identifier.replaceAll(' ', ''));
    if (errors({ ...(!validIdentifier ? { identifier: 'Enter a valid email address or Philippine mobile number.' } : {}), ...(!password ? { password: LOGIN_PASSWORD_REQUIRED } : {}) })) return;
    if ($('#remember-device').checked) rememberIdentifier(identifier);
    else clearRememberedIdentifier();
    enterDemo();
  }));
  bind('civic-sign-in', () => modal('Demo civic sign-in', [el('p', 'Government identity services are not connected in this prototype. Open the sample account to explore the portal.'), button('Continue with demo account', enterDemo)]));
  bind('forgot-password', event => {
    event.preventDefault();
    modal('Password recovery', [el('p', 'This is a demonstration. No real account or password is stored, and no recovery email will be sent.'), button('Use demo sign-in', enterDemo)]);
  });
}

function storeOnboarding(profile) {
  sessionStorage.setItem('sugbo:onboarding', JSON.stringify(sanitizeProfile(profile)));
}

function readOnboarding() {
  try { return sanitizeProfile(JSON.parse(sessionStorage.getItem('sugbo:onboarding'))); }
  catch { return {}; }
}

function setupRegister() {
  const form = $('#registrationForm');
  form.noValidate = true;
  $('#password').autocomplete = 'new-password';
  $('#confirmPassword').autocomplete = 'new-password';
  const autofill = () => {
    const values = { firstName: 'Maria Clara', middleName: 'Salcedo', lastName: 'Del Rosario', mobileNumber: '9171234567', email: 'maria@example.com' };
    Object.entries(values).forEach(([id, value]) => { $('#' + id).value = value; });
    $('#entityType').selectedIndex = 1;
    $('#lguLocation').selectedIndex = 1;
    toast('Sample details filled. Add a demo password and review the consents.');
  };
  bind('sample-autofill', autofill);
  bind('identity-autofill', () => modal('Demo identity autofill', [el('p', 'No ID scan or government lookup takes place. Use sample information to try registration.'), button('Use sample details', () => { autofill(); closeModal(); })]));
  const submit = safely(event => {
    event?.preventDefault();
    const data = Object.fromEntries($$('input,select', form).map(node => [node.id, node.type === 'checkbox' ? node.checked : node.value]));
    if (errors(validateRegistration(data))) return;
    const profile = { ...sanitizeProfile(data), ...($('#businessAddress') ? { address: $('#businessAddress').value } : {}) };
    storeOnboarding(profile);
    sessionStorage.removeItem('sugbo:otpResendAt');
    go('verify');
  });
  bind('register-submit', submit);
  form.addEventListener('submit', submit);
}

function connectOtpInputs(inputs) {
  const distribute = (digits, index) => {
    digits.slice(0, inputs.length - index).split('').forEach((digit, offset) => { inputs[index + offset].value = digit; });
    inputs[Math.min(index + digits.length, inputs.length - 1)]?.focus();
  };
  inputs.forEach((input, index) => {
    input.autocomplete = index === 0 ? 'one-time-code' : 'off';
    input.maxLength = index === 0 ? 6 : 1;
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '');
      input.value = digits.slice(0, 1);
      if (digits) distribute(digits, index);
    });
    input.addEventListener('keydown', event => { if (event.key === 'Backspace' && !input.value) inputs[index - 1]?.focus(); });
    input.addEventListener('paste', event => {
      event.preventDefault();
      distribute((event.clipboardData?.getData('text') || '').replace(/\D/g, ''), index);
    });
  });
}

function setupCooldown(control) {
  let nextResend;
  try { nextResend = Number(sessionStorage.getItem('sugbo:otpResendAt')); }
  catch { nextResend = 0; }
  const update = () => {
    const seconds = Math.max(0, Math.ceil((nextResend - Date.now()) / 1000));
    control.disabled = seconds > 0;
    control.textContent = seconds ? `Resend demo code in ${seconds}s` : 'Resend demo code';
  };
  const reset = () => {
    nextResend = Date.now() + RESEND_DELAY;
    try { sessionStorage.setItem('sugbo:otpResendAt', String(nextResend)); }
    catch { toast('The resend timer will reset if you reload because browser storage is unavailable.'); }
    update();
  };
  if (!Number.isFinite(nextResend) || nextResend <= 0 || nextResend > Date.now() + RESEND_DELAY) reset();
  update();
  const timer = window.setInterval(update, 250);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  control.addEventListener('click', () => { if (Date.now() < nextResend) return; reset(); toast(`Demo code: ${DEMO_CODE}. No SMS was sent.`); });
  return reset;
}

function setupVerification() {
  let identityReady = false;
  let profile = { ...getProfile(), ...readOnboarding() };
  const inputs = $$('.otp-box');
  const showPhone = () => { const phone = $('#verification-phone'); if (phone) phone.textContent = '+63 ' + profile.mobileNumber; };
  showPhone();
  connectOtpInputs(inputs);
  const resetCooldown = setupCooldown($('#resend-code'));
  actions(['change-phone'], () => {
    const label = el('label', 'Mobile number (+63)');
    const input = el('input');
    input.id = 'edit-phone'; input.inputMode = 'numeric'; input.autocomplete = 'tel-national'; input.value = profile.mobileNumber;
    label.htmlFor = input.id;
    input.addEventListener('input', () => input.setCustomValidity(''));
    modal('Change phone number', [label, input, button('Save phone number', () => {
      const phone = input.value.trim();
      if (!/^9\d{9}$/.test(phone)) { input.setCustomValidity('Enter 10 digits starting with 9.'); input.reportValidity(); return; }
      const next = { ...profile, mobileNumber: phone };
      storeOnboarding(next);
      profile = next; inputs.forEach(field => { field.value = ''; });
      showPhone(); resetCooldown(); closeModal(); inputs[0]?.focus();
    })]);
  });
  actions(['scan-identity', 'scan-id'], () => modal('Demo identity scan', [el('p', 'Use a sample identity to continue. No camera, real ID, or biometric data is needed.'), button('Use demo identity', () => {
    identityReady = true; closeModal();
    $$('[data-action="scan-identity"],[data-action="scan-id"]').forEach(control => { control.textContent = 'Demo identity ready'; });
    toast(`Sample identity selected. Enter demo code ${DEMO_CODE} to continue.`);
  })]));
  actions(['complete-verification'], () => {
    if (inputs.map(input => input.value).join('') !== DEMO_CODE) { toast(`Enter the six-digit demo code: ${DEMO_CODE}.`); inputs[0]?.focus(); return; }
    if (!identityReady) { toast('Complete the demo ID scan first.'); return; }
    startDemoSession(profile);
    sessionStorage.removeItem('sugbo:onboarding');
    sessionStorage.removeItem('sugbo:otpResendAt');
    go('roadmap');
  });
}
