function formatDate(isoOrDateLike) {
  if (!isoOrDateLike) return '';
  const date = new Date(isoOrDateLike);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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
