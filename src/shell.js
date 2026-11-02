import {icon} from './icons.js';

const pages = Object.freeze({roadmap: 'Roadmap', clearances: 'Clearances', apply: 'Apply', vault: 'Vault', welcome: 'Welcome', login: 'Login', register: 'Register', verify: 'Verification'});
const navigation = Object.freeze([
  ['roadmap', 'alt_route', 'Roadmap'],
  ['clearances', 'verified_user', 'Clearances'],
  ['apply', 'edit_document', 'Apply'],
  ['vault', 'folder_open', 'Vault'],
]);

export function initShell(page) {
  if (document.querySelector('#site-header')) return;
  const workspace = navigation.some(([key]) => key === page);
  document.body.classList.add(workspace ? 'workspace-layout' : 'account-layout');
  const header = document.createElement('header');
  header.id = 'site-header';
  header.className = 'site-header';
  header.innerHTML = `<div class="header-inner">
    ${!workspace && page !== 'welcome' ? `<button class="icon-button" type="button" data-action="back" aria-label="Back">${icon('arrow_back')}</button>` : ''}
    <a class="brand-link" href="./${workspace ? 'roadmap' : 'welcome'}.html" aria-label="SugboStart ${workspace ? 'roadmap' : 'welcome'}">${icon('flag')}<span>SugboStart<small>${pages[page] || 'Business demo'}</small></span></a>
    <span class="demo-chip">Demo<span> · No agency connection</span></span>
    ${workspace ? `<div class="header-actions"><button class="icon-button" type="button" data-action="notifications" aria-label="Notifications">${icon('notifications')}</button><button class="icon-button account-link" type="button" data-action="account" aria-label="Open account menu"><img src="./images/profile-photo.jpg" alt="" class="profile-photo" width="40" height="40"></button></div>` : ''}
  </div>`;
  const skip = document.createElement('a');
  skip.className = 'skip-link'; skip.href = '#main-content'; skip.textContent = 'Skip to content';
  const main = document.querySelector('main');
  if (main) { main.id = 'main-content'; main.tabIndex = -1; }
  document.body.prepend(skip, header);
  let dismissed = false;
  try { dismissed = sessionStorage.getItem('sugbo:demo-notice-dismissed') === 'true'; } catch { /* The notice remains available without storage. */ }
  if (!dismissed && main) {
    const notice = document.createElement('aside');
    notice.className = 'demo-notice'; notice.id = 'demo-notice'; notice.setAttribute('aria-label', 'Demo information');
    notice.innerHTML = `${icon('info')}<p><strong>Try the SugboStart demo.</strong> All records stay in this browser. No government service, payment, ID verification, or SMS is connected.</p><button class="icon-button" type="button" aria-label="Dismiss demo notice">${icon('close')}</button>`;
    notice.querySelector('button').onclick = () => {
      notice.remove();
      try { sessionStorage.setItem('sugbo:demo-notice-dismissed', 'true'); } catch { /* Dismissal still works for this page. */ }
    };
    main.prepend(notice);
  }
  if (workspace) {
    const nav = document.createElement('nav');
    nav.className = 'site-navigation'; nav.setAttribute('aria-label', 'Main navigation');
    nav.innerHTML = `<span class="nav-caption">YOUR WORKSPACE</span><div>${navigation.map(([key, symbol, label]) => `<a href="./${key}.html" ${page === key ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span></a>`).join('')}</div><p class="nav-description">Plan your business journey.<br>Keep your files in one place.</p>`;
    document.body.append(nav);
  }
  const ui = document.createElement('div');
  ui.id = 'shared-ui';
  ui.innerHTML = `<div id="app-toast" class="app-notification" role="status" aria-live="polite"></div><dialog id="app-dialog" aria-labelledby="dialog-title"><div class="dialog-head"><h2 id="dialog-title"></h2><button id="dialog-close" class="icon-button" aria-label="Close dialog" type="button">${icon('close')}</button></div><div id="dialog-content"></div></dialog>`;
  document.body.append(ui);
}
