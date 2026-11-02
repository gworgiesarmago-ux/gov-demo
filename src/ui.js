export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
export const pageUrl = page => new URL((page === 'index' ? 'index' : page) + '.html', location.href).href;
export const go = page => { location.href = pageUrl(page); };

const notificationTimers = new WeakMap();
export function toast(message) {
  const dialog = $('#app-dialog');
  const id = dialog?.open ? 'dialog-toast' : 'app-toast';
  let node = $('#' + id);
  if (!node) {
    node = el('div', undefined, 'app-notification');
    node.id = id;
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    (dialog?.open ? dialog : document.body).append(node);
  }
  node.textContent = String(message);
  node.classList.add('visible');
  clearTimeout(notificationTimers.get(node));
  notificationTimers.set(node, setTimeout(() => node.classList.remove('visible'), 5000));
}
export function read(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem('sugbo:' + key)) ?? fallback; }
  catch { return fallback; }
}
export function save(key, value) {
  try { localStorage.setItem('sugbo:' + key, JSON.stringify(value)); return true; }
  catch { toast('Storage is unavailable. Your changes could not be saved.'); return false; }
}
export function el(tag, text, cls) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
}
export function button(text, action, secondary = false) {
  const control = el('button', text, 'dialog-button' + (secondary ? ' secondary' : ''));
  control.type = 'button';
  control.addEventListener('click', async event => {
    try { await action(event); }
    catch (error) { console.error('Action failed:', error); toast('This action could not be completed. Please try again.'); }
  });
  return control;
}
export function modal(title, content) {
  $('#dialog-title').textContent = title;
  const target = $('#dialog-content');
  target.replaceChildren();
  $('#dialog-toast')?.classList.remove('visible');
  if (typeof content === 'string') target.append(el('p', content));
  else target.append(...(Array.isArray(content) ? content : [content]));
  if (!$('#app-dialog').open) $('#app-dialog').showModal();
  return target;
}
export function closeModal() { $('#app-dialog')?.close(); }
export function initDialog() {
  const dialog = $('#app-dialog');
  if (!dialog) return;
  $('#dialog-close').onclick = closeModal;
  dialog.addEventListener('close', () => $('#dialog-toast')?.classList.remove('visible'));
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeModal();
  });
}
export function errors(messages) {
  $$('.field-error,.error-summary').forEach(node => node.remove());
  $$('[aria-invalid]').forEach(node => {
    node.removeAttribute('aria-invalid');
    const extra = (node.getAttribute('aria-describedby') || '').split(' ').filter(id => !id.endsWith('-error'));
    if (extra.length) node.setAttribute('aria-describedby', extra.join(' '));
    else node.removeAttribute('aria-describedby');
  });
  const entries = Object.entries(messages);
  if (!entries.length) return false;
  const summary = el('div', undefined, 'error-summary');
  summary.id = 'error-summary';
  summary.tabIndex = -1;
  summary.setAttribute('role', 'alert');
  summary.append(el('strong', 'Please correct ' + entries.length + (entries.length === 1 ? ' item' : ' items') + ' before continuing.'));
  const list = el('ul');
  let first;
  entries.forEach(([id, message]) => {
    const input = $('#' + id);
    if (!input) return;
    first ??= input;
    input.setAttribute('aria-invalid', 'true');
    const text = el('p', message, 'field-error');
    text.id = id + '-error';
    text.setAttribute('role', 'alert');
    const describedBy = input.getAttribute('aria-describedby');
    input.setAttribute('aria-describedby', [describedBy, text.id].filter(Boolean).join(' '));
    const container = input.closest('[data-field]') || input.parentElement;
    container.append(text);
    const item = el('li');
    const link = el('button', message, 'error-link');
    link.type = 'button';
    link.onclick = () => { input.focus(); input.scrollIntoView({ block: 'center', behavior: 'auto' }); };
    item.append(link);
    list.append(item);
  });
  summary.append(list);
  const form = first?.closest('form') || $('main');
  form?.prepend(summary);
  summary.focus();
  return true;
}
export async function withBusy(trigger, label, task) {
  const control = trigger?.currentTarget || trigger;
  if (!control || !('disabled' in control)) return task();
  if (control.disabled) return;
  const children = [...control.childNodes];
  control.disabled = true;
  control.setAttribute('aria-busy', 'true');
  control.replaceChildren(el('span', label));
  try { return await task(); }
  finally {
    control.replaceChildren(...children);
    control.disabled = false;
    control.removeAttribute('aria-busy');
  }
}
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = el('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function bind(action, handler) {
  $$('[data-action="' + action + '"]').forEach(node => node.addEventListener('click', handler));
}

