// Serialize document mutations and submission across tabs in supported browsers.
export function withApplicationLock(action) {
  return navigator.locks?.request
    ? navigator.locks.request('sugbostart-demo-submission', action)
    : action();
}
