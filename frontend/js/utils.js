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
