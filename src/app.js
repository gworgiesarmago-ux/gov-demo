import { initStartup } from './startup.js';
import { $, $$, go, toast, read, save, el, button, modal, closeModal, initDialog } from './ui.js';
import { initAuth } from './auth.js';
import { initShell } from './shell.js';
import { getProfile, guardPage, signOut } from './session.js';
import { initApplication } from './application.js';
import { previewDocument, showQr, calendar, exportPacket } from './documents.js';
import { upcomingReminders } from './domain.js';
import { chooseUpload, files, updateLease, initUploads, clearUploads } from './uploads.js';

const page = document.body.dataset.page;
if (guardPage(page)) initialize();

function initialize() {
  initShell(page);
  initDialog();
  initStartup(page);
  initAuth(page);
  initUploads();
  renderProfile();
  wireActions();
  if (page === 'apply') initApplication();
  if (page === 'clearances') updateLease().catch(() => toast('Could not load local attachments.'));
  if (page === 'roadmap') renderRoadmap();
  if (page === 'vault') {
    renderVault();
    renderReminders();
    document.addEventListener('uploads-changed', () => renderVault());
  }
  const permit = new URLSearchParams(location.search).get('permit');
  if (permit) permitLookup(permit);
}

function wireActions() {
  const actions = {
    notifications: showNotifications,
    account,
    directions,
    back: () => go(page === 'verify' ? 'register' : 'welcome'),
    'continue-application': () => go('apply'),
    'preview-document': target => previewDocument({
      dti: 'DTI Certificate of Registration',
      cedula: 'Community Tax Certificate (Cedula)',
      lease: 'Commercial Lease Contract',
      bplo: "Mayor's Permit (BPLO)",
      bir: 'BIR Certificate of Registration',
    }[target.dataset.document] || 'DTI Certificate of Registration'),
    'attach-lease': () => chooseUpload('lease'),
    qr: target => showQr(target.dataset.reference || 'BN-2024-98124', target),
    copy: copyIdentifier,
    calendar: target => calendar(target),
    'export-packet': target => exportPacket(target),
    language: target => language(target.dataset.language),
    'verify-permit': () => permitLookup(),
  };
  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-action]');
    if (!target || target.disabled) return;
    const action = actions[target.dataset.action];
    if (!action) return;
    event.preventDefault();
    try { await action(target); }
    catch (error) { console.error('Action failed:', error); toast('This action could not be completed. Please try again.'); }
  });
}

function renderProfile() {
  const profile = getProfile();
  $$('[data-profile]').forEach(node => {
    const value = profile[node.dataset.profile];
    if (typeof value === 'string') node.textContent = value;
  });
  if ($('#greeting')) language(read('language', 'ceb'), false);
}

function renderRoadmap() {
  const submitted = read('submitted');
  let status = $('#roadmap-submission-status');
  if (!status) {
    status = el('p', undefined, 'submission-note');
    status.id = 'roadmap-submission-status';
    $('#greeting')?.parentElement.append(status);
  }
  if (submitted?.reference) {
    status.textContent = 'Demo application saved · ' + submitted.reference + ' · Awaiting review';
    const continueButton = $('#btn-continue-action');
    if (continueButton) continueButton.textContent = 'View submitted application';
  } else {
    status.textContent = 'Start by attaching your documents. All progress is saved locally.';
  }
}

function showNotifications() {
  const submitted = read('submitted');
  modal('Notifications', [
    el('strong', submitted ? 'Demo application saved' : 'Your next step'),
    el('p', submitted ? 'Your local demo application is awaiting review. No agency received it.' : 'Attach the four required documents, review the example fees, and save a demo application.'),
    button('Open application', () => go('apply')),
  ]);
}

function account() {
  const profile = getProfile();
  modal('Business account', [
    el('strong', [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ')),
    el('p', profile.email || 'Sample profile'),
    el('p', profile.businessName),
    button('Welcome & account setup', () => go('welcome')),
    button('Sign out of demo', signOut, true),
    button('Clear demo data', confirmClearData, true),
  ]);
}

function confirmClearData() {
  modal('Clear saved demo data', [
    el('p', 'Remove this browser’s local profile, drafts, applications, and uploaded files?'),
    button('Clear local data', async () => {
      await clearUploads();
      Object.keys(localStorage).filter(key => key.startsWith('sugbo:')).forEach(key => localStorage.removeItem(key));
      Object.keys(sessionStorage).filter(key => key.startsWith('sugbo:')).forEach(key => sessionStorage.removeItem(key));
      go('welcome');
    }),
    button('Keep my data', closeModal, true),
  ]);
}

function directions() {
  const link = el('a', 'Open location in Google Maps', 'dialog-button');
  link.href = 'https://www.google.com/maps/search/?api=1&query=Barangay+Lahug+Hall+Gorordo+Avenue+Cebu+City';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  modal('Example office location', [
    el('p', 'Barangay Lahug Hall · Gorordo Avenue, Lahug, Cebu City'),
    el('p', 'This is a sample office location from the design. Confirm the current address, opening hours, and requirements before visiting.'),
    link,
  ]);
}

function language(lang, notify = true) {
  const current = lang === 'en' ? 'en' : 'ceb';
  save('language', current);
  const name = getProfile().firstName.split(' ')[0] || 'there';
  if ($('#greeting')) $('#greeting').textContent = (current === 'en' ? 'Good day, ' : 'Maayong adlaw, ') + name + '!';
  if ($('#guide-label')) $('#guide-label').textContent = current === 'en' ? 'Business registration guides' : 'Panudlo sa Pagnenegosyo (Guides)';
  $$('[data-action="language"]').forEach(control => {
    const active = control.dataset.language === current;
    control.classList.toggle('is-active', active);
    control.classList.toggle('bg-brand', active);
    control.classList.toggle('text-white', active);
    control.setAttribute('aria-pressed', String(active));
  });
  if (notify) toast(current === 'en' ? 'Guide language: English' : 'Piniling pinulongan sa panudlo: Cebuano');
}

async function copyIdentifier(target) {
  const value = target.dataset.copy;
  if (!value) return;
  try { await navigator.clipboard.writeText(value); toast('Copied sample ' + (target.dataset.label || 'identifier') + '.'); }
  catch {
    const label = el('label', 'Sample identifier');
    const input = el('input');
    input.id = 'copy-identifier';
    input.value = value;
    input.readOnly = true;
    label.htmlFor = input.id;
    modal('Copy sample identifier', [label, input]);
    input.select();
  }
}

async function renderVault() {
  const container = $('#vault-documents');
  if (!container) return;
  container.setAttribute('aria-busy', 'true');
  try {
    const rows = await files();
    container.replaceChildren();
    if (!rows.length) {
      container.append(el('h3', 'Your document vault is empty', 'font-semibold'),
        el('p', 'Documents you attach to an application will appear here. Nothing has been uploaded or verified yet.'),
        button('Add application documents', () => go('apply')));
    } else {
      rows.forEach(file => {
        const row = el('div', undefined, 'upload-row');
        const details = el('div', undefined, 'document-details');
        details.append(el('strong', file.name), el('p', 'Attached locally · Not verified · ' + Math.ceil(file.size / 1024) + ' KB'));
        const view = el('button', 'View', 'document-action');
        view.type = 'button';
        view.dataset.action = 'view-upload';
        view.dataset.uploadId = file.id;
        view.setAttribute('aria-label', 'View ' + file.name);
        row.append(details, view);
        container.append(row);
      });
    }
  } catch {
    container.replaceChildren(el('p', 'Local documents could not be loaded. Try reloading this page.'));
  } finally { container.removeAttribute('aria-busy'); }
}

function renderReminders() {
  const container = $('#compliance-deadlines');
  if (!container) return;
  const formatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Singapore' });
  container.replaceChildren(el('p', 'Sample planning dates only. Confirm official deadlines with the relevant agency.'));
  upcomingReminders().forEach(item => {
    const row = el('div', undefined, 'review-row');
    const date = el('time', formatter.format(new Date(item.date + 'T00:00:00+08:00')));
    date.dateTime = item.date;
    row.append(el('span', item.title), date);
    container.append(row);
  });
}

function permitLookup(value = '') {
  const label = el('label', 'Sample reference');
  const input = el('input');
  input.id = 'permit-reference';
  input.value = value;
  input.placeholder = 'BN-2024-98124';
  label.htmlFor = input.id;
  const result = el('p');
  result.setAttribute('role', 'status');
  modal('Look up a sample record', [
    el('p', 'This searches fictional examples only. It cannot verify real permits or government records.'),
    label, input, result,
    button('Look up sample record', () => {
      const id = input.value.trim();
      result.textContent = ['BN-2024-98124', 'BPLO-CC-2024-008912'].includes(id)
        ? 'Sample reference found. This is demonstration content, not an issued or verified permit.'
        : 'No matching sample record. Try BN-2024-98124.';
    }),
  ]);
}

