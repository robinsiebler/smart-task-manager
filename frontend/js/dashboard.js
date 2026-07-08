const PRIORITY_ORDER = ['High', 'Medium', 'Low'];
const PRIORITY_COLORS = {
  High: '#e0554f',
  Medium: '#e0a13f',
  Low: '#3f9e5c',
};

function showStatusMessage(message, isError = false) {
  const el = document.getElementById('status-message');
  el.textContent = message;
  el.hidden = false;
  el.classList.toggle('status-message--error', isError);
}

function renderStats(dashboard) {
  document.getElementById('stat-total').textContent = dashboard.total;
  document.getElementById('stat-completed').textContent = dashboard.completed;
  document.getElementById('stat-pending').textContent = dashboard.pending;
  document.getElementById('stat-overdue').textContent = dashboard.overdue;
}

function createSvgElement(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

function renderPriorityDonut(byPriority) {
  const container = document.getElementById('priority-donut');
  const legend = document.getElementById('priority-legend');
  container.textContent = '';
  legend.textContent = '';

  const countsByPriority = Object.fromEntries(byPriority.map((p) => [p.priority, p.count]));
  const total = byPriority.reduce((sum, p) => sum + p.count, 0);

  const size = 160;
  const radius = 60;
  const strokeWidth = 28;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  const svg = createSvgElement('svg', {
    viewBox: `0 0 ${size} ${size}`,
    width: size,
    height: size,
    role: 'img',
    'aria-label': 'Tasks by priority',
  });

  if (total === 0) {
    const bgCircle = createSvgElement('circle', {
      cx: center,
      cy: center,
      r: radius,
      fill: 'none',
      stroke: '#e2e2e2',
      'stroke-width': strokeWidth,
    });
    svg.appendChild(bgCircle);
    container.appendChild(svg);

    const emptyItem = document.createElement('li');
    emptyItem.textContent = 'No tasks yet';
    legend.appendChild(emptyItem);
    return;
  }

  let cumulativeLength = 0;
  for (const priority of PRIORITY_ORDER) {
    const count = countsByPriority[priority] || 0;
    if (count === 0) continue;

    const fraction = count / total;
    const dashLength = fraction * circumference;

    const circle = createSvgElement('circle', {
      cx: center,
      cy: center,
      r: radius,
      fill: 'none',
      stroke: PRIORITY_COLORS[priority],
      'stroke-width': strokeWidth,
      'stroke-dasharray': `${dashLength} ${circumference - dashLength}`,
      'stroke-dashoffset': -cumulativeLength,
      transform: `rotate(-90 ${center} ${center})`,
    });
    svg.appendChild(circle);
    cumulativeLength += dashLength;

    const legendItem = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = 'chart-legend__swatch';
    swatch.style.backgroundColor = PRIORITY_COLORS[priority];
    legendItem.appendChild(swatch);
    legendItem.appendChild(document.createTextNode(`${priority}: ${count}`));
    legend.appendChild(legendItem);
  }

  container.appendChild(svg);
}

function renderCategoryBars(byCategory) {
  const container = document.getElementById('category-bars');
  container.textContent = '';

  if (byCategory.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No tasks yet';
    container.appendChild(empty);
    return;
  }

  const maxCount = Math.max(...byCategory.map((c) => c.count));
  const sorted = [...byCategory].sort((a, b) => b.count - a.count);

  for (const { category, count } of sorted) {
    const row = document.createElement('div');
    row.className = 'bar-row';

    const label = document.createElement('span');
    label.className = 'bar-row__label';
    label.textContent = category;
    row.appendChild(label);

    const track = document.createElement('div');
    track.className = 'bar-row__track';
    const fill = document.createElement('div');
    fill.className = 'bar-row__fill';
    fill.style.width = `${(count / maxCount) * 100}%`;
    track.appendChild(fill);
    row.appendChild(track);

    const value = document.createElement('span');
    value.className = 'bar-row__value';
    value.textContent = count;
    row.appendChild(value);

    container.appendChild(row);
  }
}

async function loadDashboard() {
  const { dashboard } = await api.getDashboard();
  renderStats(dashboard);
  renderPriorityDonut(dashboard.byPriority);
  renderCategoryBars(dashboard.byCategory);
  document.getElementById('dashboard-content').hidden = false;
}

async function init() {
  if (!api.isAuthenticated()) {
    document.getElementById('auth-warning').hidden = false;
    return;
  }

  try {
    await loadDashboard();
  } catch (err) {
    showStatusMessage(err.message, true);
  }
}

init();
