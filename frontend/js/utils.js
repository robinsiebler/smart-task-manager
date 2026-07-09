const EYE_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">' +
  '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';

const EYE_OFF_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">' +
  '<path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>' +
  '<line x1="1" y1="1" x2="23" y2="23"/></svg>';

function attachPasswordToggle(inputId, toggleId) {
  const input = document.getElementById(inputId);
  const toggle = document.getElementById(toggleId);
  if (!input || !toggle) return;

  toggle.innerHTML = EYE_ICON;

  toggle.addEventListener('click', () => {
    const willShow = input.type === 'password';
    input.type = willShow ? 'text' : 'password';
    toggle.innerHTML = willShow ? EYE_OFF_ICON : EYE_ICON;
    toggle.setAttribute('aria-label', willShow ? 'Hide password' : 'Show password');
  });
}

function formatDate(isoOrDateLike) {
  if (!isoOrDateLike) return '';
  const date = new Date(isoOrDateLike);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function toDateInputValue(isoOrDateLike) {
  if (!isoOrDateLike) return '';
  const date = new Date(isoOrDateLike);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function redirectToLogin() {
  window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
}

function getSafeRedirectTarget(fallback = '/') {
  const params = new URLSearchParams(window.location.search);
  const target = params.get('redirect');
  if (target && target.startsWith('/') && !target.startsWith('//')) {
    return target;
  }
  return fallback;
}
