/** Show the brief account introduction once per tab session. */
export function initStartup(page) {
  if (page !== 'welcome') return;
  const splash = document.querySelector('#startup-screen');
  const main = document.querySelector('main');
  if (!splash || !main) return;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let hasSeenStartup = false;
  try {
    hasSeenStartup = sessionStorage.getItem('sugbo:startupSeen') === 'true';
    sessionStorage.setItem('sugbo:startupSeen', 'true');
  } catch {
    // If storage is disabled, do not impose a repeated artificial delay.
    hasSeenStartup = true;
  }
  if (hasSeenStartup || reducedMotion.matches || new URLSearchParams(location.search).has('permit')) {
    splash.remove();
    return;
  }
  main.inert = true;
  document.body.classList.add('starting-up');
  let startTimer;
  let exitTimer;
  const finish = () => {
    clearTimeout(startTimer);
    clearTimeout(exitTimer);
    main.inert = false;
    document.body.classList.remove('starting-up');
    splash.remove();
    reducedMotion.removeEventListener('change', onPreferenceChange);
  };
  const onPreferenceChange = () => { if (reducedMotion.matches) finish(); };
  reducedMotion.addEventListener('change', onPreferenceChange);
  startTimer = window.setTimeout(() => {
    splash.classList.add('startup-exit');
    exitTimer = window.setTimeout(finish, 220);
  }, 1000);
}
