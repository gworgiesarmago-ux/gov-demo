import {$, $$, go, el, button, toast, read, save, errors, withBusy} from './ui.js';
import {calculateFees, validateApplication} from './domain.js';
import {chooseUpload, files, renderUploads, documentProgress} from './uploads.js';
import {withApplicationLock} from './application-lock.js';

const currency = value => '₱ ' + value.toLocaleString('en-PH', {minimumFractionDigits: 2});
let reviewData = null;
let reviewProfile = null;
let reviewAttachments = null;
let initialized = false;

const attachmentSnapshot = rows => JSON.stringify(rows.map(({id, revision, uploadedAt, name, size, type}) =>
  ({id, revision, uploadedAt, name, size, type})).sort((a, b) => a.id.localeCompare(b.id)));

function values() {
  return {
    employees: $('#employees-count').value,
    capitalization: $('#capitalization-amount').value,
    delivery: $('input[name=delivery_option]:checked')?.value || '',
  };
}

function applyValues(data) {
  $('#employees-count').value = data.employees ?? '';
  $('#capitalization-amount').value = data.capitalization ?? '';
  $$('input[name=delivery_option]').forEach(input => { input.checked = input.value === data.delivery; });
}

function updateFees() {
  const data = values();
  if (!['pickup', 'express'].includes(data.delivery)) return;
  const fee = calculateFees(data.delivery);
  $('#total-fee-display').textContent = currency(fee.total);
  $('#delivery-breakdown').replaceChildren(
    el('span', data.delivery === 'pickup' ? 'Demo service (personal pick-up)' : 'Demo service (courier handling)'),
    el('span', fee.delivery ? currency(fee.delivery) : 'Free', 'font-semibold text-slate-800'),
  );
  $$('input[name=delivery_option]').forEach(input => {
    const label = input.closest('label');
    label.classList.toggle('border-brand', input.checked);
    label.classList.toggle('border-2', input.checked);
    label.classList.toggle('bg-blue-50/30', input.checked);
  });
}

export function applicationSummary(data, profile = {}) {
  const name = [profile.firstName, profile.lastName].filter(value => typeof value === 'string' && value.trim()).join(' ') || 'Demo applicant';
  return [
    ['Applicant', name],
    ['Business', profile.businessName || 'Your demo business'],
    ['Address', profile.address || 'Not provided'],
    ['Employees', String(data.employees)],
    ['Capitalization', String(data.capitalization)],
    ['Release', data.delivery === 'pickup' ? 'Personal pick-up (demo)' : 'Digital + courier (demo)'],
    ['Total demo fees', currency(calculateFees(data.delivery).total)],
  ];
}

export function createSubmission(data, rows, profile = {}, now = new Date()) {
  if (Object.keys(validateApplication(data)).length || documentProgress(rows).missing.length) {
    throw new TypeError('Complete all required information and attachments before submitting.');
  }
  return {
    ...data,
    applicant: {firstName: profile.firstName || '', lastName: profile.lastName || '', businessName: profile.businessName || '', address: profile.address || ''},
    attachments: rows.map(({id, kind, name, type, size}) => ({id, kind, name, type, size})),
    fees: calculateFees(data.delivery),
    reference: 'DEMO-' + crypto.randomUUID().toUpperCase(),
    status: 'Awaiting review',
    createdAt: now.toISOString(),
    isDemo: true,
  };
}

function fieldIssues(data) {
  return Object.fromEntries(Object.entries(validateApplication(data)).map(([key, value]) => [
    key === 'employees' ? 'employees-count' : key === 'capitalization' ? 'capitalization-amount' : 'application-form', value,
  ]));
}

function validate(data, rows) {
  const missing = documentProgress(rows).missing;
  const issues = {
    ...fieldIssues(data),
    ...(missing.length ? {'required-documents': 'Attach all required documents before review: ' + missing.map(item => item.label).join(', ') + '.'} : {}),
  };
  return !errors(issues);
}

function setStep(step, submitted = false) {
  $('#application-step-label').textContent = submitted ? 'Submitted demo' : `Step ${step} of 3`;
  const heading = $('#application-heading');
  heading.textContent = submitted ? 'Demo application submitted' : step === 3 ? 'Review your demo application' : 'Business Clearance Application';
  const stepper = $('#application-stepper');
  stepper.replaceChildren(...['1. Profile', '2. Documents', '3. Review'].map((label, index) => {
    const item = el('div', label, 'application-step' + (index + 1 <= step ? ' is-active' : ''));
    if (index + 1 === step) item.setAttribute('aria-current', 'step');
    return item;
  }));
}

function populateEntity(profile) {
  if ($('#entity-name')) $('#entity-name').textContent = profile.businessName || 'Your demo business';
  if ($('#entity-address')) $('#entity-address').textContent = profile.address || 'Add your business address in account setup.';
}

function summaryRows(data, profile) {
  const summary = el('dl', undefined, 'dialog-info application-summary');
  for (const [label, value] of applicationSummary(data, profile)) {
    const row = el('div', undefined, 'review-row');
    row.append(el('dt', label), el('dd', value, 'font-semibold'));
    summary.append(row);
  }
  return summary;
}

function editApplication(focus = true) {
  if (read('submitted')) { showSubmitted(read('submitted')); return; }
  reviewData = null;
  reviewProfile = null;
  reviewAttachments = null;
  $('#application-review')?.remove();
  $('#application-form').hidden = false;
  setStep(2);
  if (focus) $('#employees-count').focus();
}

async function openReview() {
  if (read('submitted')) { showSubmitted(read('submitted')); return; }
  const data = values();
  let rows;
  try { rows = await files(); }
  catch { toast('Attachments could not be loaded. Please try again before reviewing.'); return; }
  if (!validate(data, rows)) return;
  reviewData = {...data};
  reviewProfile = {...read('profile', {})};
  reviewAttachments = attachmentSnapshot(rows);
  const section = el('section', undefined, 'application-review bg-surface rounded-md border border-slate-200 p-4');
  section.id = 'application-review';
  section.tabIndex = -1;
  const title = el('h2', 'Step 3 · Review and confirm', 'font-semibold');
  title.id = 'review-heading'; section.setAttribute('aria-labelledby', title.id);
  const documents = el('ul', undefined, 'review-documents');
  rows.forEach(file => documents.append(el('li', file.name + ' · Attached locally, not verified')));
  const confirm = button('Confirm demo submission', () => runBusy(confirm, 'Saving demo…', confirmSubmission));
  confirm.id = 'confirm-submission-btn'; confirm.dataset.action = 'confirm-submission';
  const edit = button('Back to documents', () => editApplication(), true);
  edit.id = 'edit-application-btn'; edit.dataset.action = 'edit-application';
  section.append(title, summaryRows(data, reviewProfile), el('h3', 'Attached documents', 'font-semibold'), documents,
    el('p', 'Review the information above. Confirming saves this demo only in this browser and locks the application. No government submission, payment, or document verification takes place.', 'dialog-info'), confirm, edit);
  $('#application-review')?.remove();
  $('#application-form').hidden = true;
  $('#application-form').after(section);
  setStep(3);
  section.focus();
}

async function confirmSubmission() {
  if (!reviewData) return;
  const commit = async () => {
    const existing = read('submitted');
    if (existing) { showSubmitted(existing); return; }
    const rows = await files();
    if (attachmentSnapshot(rows) !== reviewAttachments) {
      editApplication();
      await renderUploads();
      toast('Attachments changed since your review. Please review the updated documents before confirming.');
      return;
    }
    if (!validate(reviewData, rows)) {
      editApplication(false);
      validate(values(), rows);
      return;
    }
    const submitted = createSubmission(reviewData, rows, reviewProfile);
    // Check again after the storage read; another tab may have finished first.
    const current = read('submitted');
    if (current) { showSubmitted(current); return; }
    if (!save('submitted', submitted)) return;
    showSubmitted(submitted);
    await renderUploads();
    toast('Demo application saved. No government submission or payment was made.');
  };
  await withApplicationLock(commit);
}

function showSubmitted(submitted) {
  reviewData = null;
  reviewProfile = null;
  reviewAttachments = null;
  $('#application-review')?.remove();
  $('#application-submitted')?.remove();
  applyValues(submitted);
  updateFees();
  populateEntity(submitted.applicant || read('profile', {}));
  const form = $('#application-form');
  form.hidden = false;
  $$('input, select, textarea, button', form).forEach(control => {
    if (control.dataset.action !== 'view-upload') control.disabled = true;
  });
  $('#application-actions').hidden = true;
  form.setAttribute('aria-label', 'Submitted demo application — read only');
  const receipt = el('section', undefined, 'application-submitted bg-surface rounded-md border border-slate-200 p-4');
  receipt.id = 'application-submitted'; receipt.tabIndex = -1;
  receipt.setAttribute('aria-labelledby', 'submitted-heading');
  const title = el('h2', '✓ Demo submitted', 'font-semibold'); title.id = 'submitted-heading';
  const reference = el('p', 'Reference: ' + submitted.reference, 'submission-reference');
  reference.id = 'submitted-reference';
  receipt.append(title, reference, el('p', 'Status: Awaiting review (local demo)'),
    el('p', 'This application is saved and locked in this browser. No agency received it, no payment was taken, and no documents were verified.', 'dialog-info'),
    button('View compliance roadmap', () => go('roadmap')));
  form.before(receipt);
  setStep(3, true);
  receipt.focus();
}

async function runBusy(target, label, task) {
  try { await withBusy(target, label, task); }
  catch { toast('The application could not be saved. Please try again.'); }
}

export function initApplication() {
  if (initialized || !$('#application-form')) return;
  initialized = true;
  const saved = read('submitted') || read('draft');
  if (saved && typeof saved === 'object') applyValues(saved);
  populateEntity(read('profile', {}));
  $$('input[name=delivery_option]').forEach(input => input.addEventListener('change', updateFees));
  updateFees();
  setStep(2);
  $('#submit-btn').textContent = 'Review application';
  $('#submit-btn').addEventListener('click', () => runBusy($('#submit-btn'), 'Loading review…', openReview));
  $('#draft-btn').addEventListener('click', () => {
    if (read('submitted')) { showSubmitted(read('submitted')); return; }
    const data = values();
    if (!errors(fieldIssues(data)) && save('draft', data)) toast('Draft saved in this browser.');
  });
  $('#application-form').addEventListener('submit', event => {
    event.preventDefault();
    runBusy($('#submit-btn'), 'Loading review…', openReview);
  });
  document.addEventListener('click', event => {
    const target = event.target.closest('button[data-action]');
    if (!target || target.disabled) return;
    if (target.dataset.action === 'back-clearances') go('clearances');
    if (target.dataset.action === 'upload-photo') chooseUpload('photo');
    if (target.dataset.action === 'upload-supplemental') chooseUpload();
  });
  window.addEventListener('storage', event => {
    if (event.key === 'sugbo:submitted' && read('submitted')) {
      showSubmitted(read('submitted'));
      renderUploads().catch(() => toast('Local attachments could not be loaded.'));
    }
  });
  if (read('submitted')) showSubmitted(read('submitted'));
  renderUploads().catch(() => toast('Local attachments could not be loaded.'));
}
