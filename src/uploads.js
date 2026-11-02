import {$, el, toast, modal, read, withBusy} from './ui.js';
import {validateUpload, sniffUpload} from './domain.js';
import {withApplicationLock} from './application-lock.js';

export const REQUIRED_DOCUMENTS = Object.freeze([
  Object.freeze({kind: 'dti', label: 'DTI Certificate of Registration'}),
  Object.freeze({kind: 'lease', label: 'Commercial Lease Contract'}),
  Object.freeze({kind: 'cedula', label: 'Community Tax Certificate (Cedula)'}),
  Object.freeze({kind: 'photo', label: '2×2 ID Photo of Owner'}),
]);

export function documentProgress(rows = []) {
  const present = new Set(rows.filter(row => row?.blob instanceof Blob && row.blob.size > 0).map(row => row.kind));
  const missing = REQUIRED_DOCUMENTS.filter(item => !present.has(item.kind));
  return {total: REQUIRED_DOCUMENTS.length, uploaded: REQUIRED_DOCUMENTS.length - missing.length, missing};
}

async function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('sugbostart-documents', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files', {keyPath: 'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other app tabs and try again.'));
  });
}

async function operate(mode, action) {
  const db = await database();
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('files', mode);
      const request = action(transaction.objectStore('files'));
      transaction.oncomplete = () => { db.close(); resolve(request.result); };
      transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error); };
    } catch (error) { db.close(); reject(error); }
  });
}

export async function files() { return operate('readonly', store => store.getAll()); }
function isLocked() { return Boolean(read('submitted')); }

async function storeUpload(file, kind) {
  const metadataError = validateUpload(file);
  if (metadataError) { toast(metadataError); return false; }
  const result = await sniffUpload(file);
  if (result.error) { toast(result.error); return false; }
  if (kind === 'photo' && !result.type.startsWith('image/')) {
    toast('Choose a JPEG or PNG photo.');
    return false;
  }
  const saved = await withApplicationLock(async () => {
    if (isLocked()) { toast('This demo application has already been submitted. Its attachments are locked.'); return false; }
    await operate('readwrite', store => store.put({
      id: kind === 'supplemental' ? crypto.randomUUID() : kind,
      revision: crypto.randomUUID(),
      name: file.name, type: result.type, size: file.size, kind,
      blob: new Blob([file], {type: result.type}), uploadedAt: new Date().toISOString(),
    }));
    return true;
  });
  if (!saved) return false;
  await renderUploads();
  toast(file.name + ' attached locally. It has not been verified or sent to an agency.');
  return true;
}

export async function chooseUpload(kind = 'supplemental') {
  if (!['supplemental', ...REQUIRED_DOCUMENTS.map(item => item.kind)].includes(kind)) return false;
  if (isLocked()) { toast('This demo application has already been submitted. Its attachments are locked.'); return false; }
  return new Promise(resolve => {
    const picker = el('input');
    picker.type = 'file';
    picker.accept = kind === 'photo' ? '.jpg,.jpeg,.png,image/jpeg,image/png' : '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
    picker.id = 'upload-picker';
    picker.setAttribute('aria-label', 'Choose ' + kind + ' file');
    picker.hidden = true;
    document.body.append(picker);
    picker.oncancel = () => { picker.remove(); resolve(false); };
    picker.onchange = async () => {
      const file = picker.files[0];
      picker.remove();
      try { resolve(await storeUpload(file, kind)); }
      catch { toast('Could not store this file. Browser storage may be unavailable.'); resolve(false); }
    };
    picker.click();
  });
}

function actionButton(label, action, file, kind) {
  const node = el('button', label, 'document-action');
  node.type = 'button';
  node.dataset.action = action;
  if (file) node.dataset.uploadId = file.id;
  if (kind) node.dataset.kind = kind;
  node.disabled = action !== 'view-upload' && isLocked();
  return node;
}

function documentRow(item, file) {
  const row = el('div', undefined, 'upload-row document-row');
  row.dataset.documentKind = item.kind;
  const details = el('div', undefined, 'document-details');
  details.append(el('strong', item.label));
  details.append(el('p', file ? file.name + ' · ' + Math.ceil(file.size / 1024) + ' KB' : 'Not attached', 'text-slate-600'));
  details.append(el('p', file ? 'Attached locally · Not verified' : 'Required before review', 'text-slate-600'));
  const actions = el('div', undefined, 'document-actions');
  if (file) {
    const view = actionButton('View', 'view-upload', file);
    view.setAttribute('aria-label', 'View ' + item.label);
    const remove = actionButton('Remove', 'delete-upload', file);
    remove.setAttribute('aria-label', 'Remove ' + item.label);
    actions.append(view, remove);
  } else actions.append(actionButton('Attach', 'upload-slot', null, item.kind));
  row.append(details, actions);
  return row;
}

function ensureDocumentList() {
  const section = $('#required-documents');
  if (!section) return null;
  if (!$('#document-list', section)) {
    const title = el('legend', 'Required Documents', 'font-semibold');
    const count = el('p'); count.id = 'document-count';
    const status = el('p'); status.id = 'document-status'; status.setAttribute('role', 'status');
    const list = el('div', undefined, 'upload-list'); list.id = 'document-list';
    section.replaceChildren(title, count, status, list);
  }
  section.tabIndex = -1;
  return $('#document-list', section);
}

export async function renderUploads() {
  initUploads();
  const rows = await files();
  const progress = documentProgress(rows);
  const list = ensureDocumentList();
  if (list) {
    const required = REQUIRED_DOCUMENTS.map(item => documentRow(item, rows.find(file => file.kind === item.kind && file.blob instanceof Blob && file.blob.size > 0)));
    const extras = rows.filter(file => !REQUIRED_DOCUMENTS.some(item => item.kind === file.kind));
    list.replaceChildren(...required, ...extras.map(file => documentRow({kind: 'supplemental', label: 'Supplemental document'}, file)));
    list.append(actionButton('Attach Supplemental Document (Optional)', 'upload-slot', null, 'supplemental'));
    $('#document-count').textContent = `${progress.uploaded} of ${progress.total} required attachments uploaded`;
    $('#document-status').textContent = progress.missing.length ? 'Documents needed' : 'Ready for review · Not verified';
  }
  await updateLease(rows);
  document.dispatchEvent(new CustomEvent('uploads-changed', {detail: {rows}}));
  return rows;
}

async function viewFile(file) {
  const url = URL.createObjectURL(file.blob);
  const link = el('a', 'Download ' + file.name, 'dialog-button');
  link.href = url; link.download = file.name;
  const nodes = [el('p', 'Stored locally in this browser. This file has not been verified or sent to an agency.'), link];
  if (file.type.startsWith('image/')) {
    const image = el('img'); image.src = url; image.alt = file.name;
    image.style.maxHeight = '320px'; image.style.objectFit = 'contain';
    nodes.unshift(image);
  }
  modal(file.name, nodes);
  $('#app-dialog').addEventListener('close', () => URL.revokeObjectURL(url), {once: true});
}

let initialized = false;
export function initUploads() {
  if (initialized) return;
  initialized = true;
  document.addEventListener('click', async event => {
    const target = event.target.closest('button[data-action]');
    if (!target || target.disabled) return;
    const action = target.dataset.action;
    if (!['upload-slot', 'view-upload', 'delete-upload'].includes(action)) return;
    event.preventDefault();
    try {
      await withBusy(target, action === 'upload-slot' ? 'Choosing…' : 'Loading…', async () => {
        if (action === 'upload-slot') { await chooseUpload(target.dataset.kind); return; }
        const rows = await files();
        const file = rows.find(item => item.id === target.dataset.uploadId);
        if (!file) { toast('That attachment is no longer available.'); await renderUploads(); return; }
        if (action === 'view-upload') { await viewFile(file); return; }
        const removed = await withApplicationLock(async () => {
          if (isLocked()) { toast('Attachments are locked after demo submission.'); return false; }
          await operate('readwrite', store => store.delete(file.id));
          return true;
        });
        if (!removed) return;
        await renderUploads();
        toast('Attachment removed from this browser.');
      });
    } catch { toast('Unable to access this attachment. Please try again.'); }
  });
}

export async function updateLease(loadedRows) {
  const status = $('#lease-status');
  const count = $('#clearance-document-count');
  if (!status && !count) return;
  try {
    const rows = loadedRows || await files();
    const progress = documentProgress(rows);
    if (status) status.textContent = rows.some(row => row.kind === 'lease' && row.blob instanceof Blob && row.blob.size > 0) ? 'Attached locally · Not verified' : 'Not attached · Required before review';
    if (count) count.textContent = `${progress.uploaded} of ${progress.total} uploaded locally`;
  } catch { if (status) status.textContent = 'Local attachments could not be loaded.'; }
}

export async function clearUploads() { await withApplicationLock(() => operate('readwrite', store => store.clear())); }
