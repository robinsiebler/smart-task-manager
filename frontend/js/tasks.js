let categories = [];
let currentTasks = [];
const currentFilters = { title: '', status: '', priority: '', categoryId: '', dueDate: '' };
let currentSort = 'dueDate';

const form = document.getElementById('task-form');
const overlay = document.getElementById('task-form-overlay');

function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

function buildTaskQuery(filters) {
  const params = new URLSearchParams();
  if (filters.title) params.set('title', filters.title);
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.dueDate) params.set('dueDate', filters.dueDate);
  const query = params.toString();
  return query ? `?${query}` : '';
}

function sortTasks(tasks, sortBy) {
  const sorted = [...tasks];

  if (sortBy === 'priority') {
    const order = { High: 0, Medium: 1, Low: 2 };
    sorted.sort((a, b) => order[a.priority] - order[b.priority]);
  } else if (sortBy === 'title') {
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  } else if (sortBy === 'status') {
    const order = { Pending: 0, 'In Progress': 1, Completed: 2, Cancelled: 3 };
    sorted.sort((a, b) => order[a.status] - order[b.status]);
  } else {
    sorted.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  }

  return sorted;
}

function showStatusMessage(message, isError = false) {
  const el = document.getElementById('status-message');
  el.textContent = message;
  el.hidden = false;
  el.classList.toggle('status-message--error', isError);
  setTimeout(() => {
    el.hidden = true;
  }, 4000);
}

function isOverdue(task) {
  if (task.status === 'Completed') return false;
  const due = new Date(task.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function renderTaskCard(task) {
  const card = document.createElement('article');
  card.className = 'task-card';
  card.dataset.taskId = task.taskId;
  if (task.status === 'Completed') card.classList.add('task-card--completed');
  if (isOverdue(task)) card.classList.add('task-card--overdue');

  const title = document.createElement('h3');
  title.className = 'task-card__title';
  title.textContent = task.title;
  card.appendChild(title);

  if (task.description) {
    const desc = document.createElement('p');
    desc.className = 'task-card__description';
    desc.textContent = task.description;
    card.appendChild(desc);
  }

  const meta = document.createElement('div');
  meta.className = 'task-card__meta';

  const priority = document.createElement('span');
  priority.className = `badge badge--priority-${task.priority.toLowerCase()}`;
  priority.textContent = task.priority;
  meta.appendChild(priority);

  const status = document.createElement('span');
  status.className = `badge badge--status-${task.status.toLowerCase().replace(/\s+/g, '-')}`;
  status.textContent = task.status;
  meta.appendChild(status);

  const due = document.createElement('span');
  due.className = 'task-card__due';
  due.textContent = `Due ${formatDate(task.dueDate)}`;
  meta.appendChild(due);

  card.appendChild(meta);

  if (task.categories.length > 0) {
    const categoryRow = document.createElement('div');
    categoryRow.className = 'task-card__categories';
    for (const category of task.categories) {
      const categoryBadge = document.createElement('span');
      categoryBadge.className = 'badge badge--category';
      categoryBadge.textContent = category.name;
      categoryRow.appendChild(categoryBadge);
    }
    card.appendChild(categoryRow);
  }

  const actions = document.createElement('div');
  actions.className = 'task-card__actions';

  if (task.status !== 'Completed') {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-secondary';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openEditForm(task));
    actions.appendChild(editBtn);

    const completeBtn = document.createElement('button');
    completeBtn.type = 'button';
    completeBtn.className = 'btn btn-secondary';
    completeBtn.textContent = 'Mark Complete';
    completeBtn.addEventListener('click', () => handleComplete(task.taskId));
    actions.appendChild(completeBtn);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-danger';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => handleDelete(task.taskId));
  actions.appendChild(deleteBtn);

  card.appendChild(actions);
  return card;
}

function renderTasks(tasks) {
  const container = document.getElementById('task-list');
  container.textContent = '';

  if (tasks.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No tasks yet. Click "Add Task" to create one.';
    container.appendChild(empty);
    return;
  }

  for (const task of tasks) {
    container.appendChild(renderTaskCard(task));
  }
}

async function loadTasks() {
  const query = buildTaskQuery(currentFilters);
  const data = await api.getTasks(query);
  currentTasks = data.tasks;
  renderTasks(sortTasks(currentTasks, currentSort));
}

function getCheckedCategoryIds() {
  return Array.from(document.querySelectorAll('#task-categories input:checked')).map((input) =>
    Number(input.value)
  );
}

function populateCategoryCheckboxes(checkedIds = []) {
  const container = document.getElementById('task-categories');
  container.textContent = '';

  for (const category of categories) {
    const label = document.createElement('label');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = String(category.categoryId);
    checkbox.checked = checkedIds.includes(category.categoryId);

    label.appendChild(checkbox);
    label.append(category.name);
    container.appendChild(label);
  }
}

function populateCategoryFilterSelect() {
  const select = document.getElementById('filter-category');
  const previousValue = select.value;
  select.textContent = '';

  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'All Categories';
  select.appendChild(allOption);

  for (const category of categories) {
    const option = document.createElement('option');
    option.value = String(category.categoryId);
    option.textContent = category.name;
    select.appendChild(option);
  }

  select.value = previousValue;
}

async function loadCategories() {
  const data = await api.getCategories();
  categories = data.categories;
  populateCategoryCheckboxes(getCheckedCategoryIds());
  populateCategoryFilterSelect();
}

function clearErrors() {
  document.querySelectorAll('.field-error').forEach((el) => {
    el.textContent = '';
  });
}

function getFormValues() {
  return {
    taskId: document.getElementById('task-id').value,
    title: document.getElementById('task-title').value.trim(),
    description: document.getElementById('task-description').value.trim(),
    priority: document.getElementById('task-priority').value,
    status: document.getElementById('task-status').value,
    dueDate: document.getElementById('task-due-date').value,
    categoryIds: getCheckedCategoryIds(),
  };
}

function validateForm(values) {
  const errors = {};

  if (!values.title) {
    errors.title = 'Title is required.';
  } else if (values.title.length > 200) {
    errors.title = 'Title must be 200 characters or fewer.';
  }

  if (!values.priority) {
    errors.priority = 'Priority is required.';
  }

  if (!values.dueDate) {
    errors.dueDate = 'Due date is required.';
  } else if (Number.isNaN(Date.parse(values.dueDate))) {
    errors.dueDate = 'Enter a valid due date.';
  }

  return errors;
}

function showFormErrors(errors) {
  clearErrors();
  for (const [field, message] of Object.entries(errors)) {
    const elementId = field === 'dueDate' ? 'due-date-error' : `${field}-error`;
    const el = document.getElementById(elementId);
    if (el) el.textContent = message;
  }
}

function openCreateForm() {
  form.reset();
  document.getElementById('task-id').value = '';
  document.getElementById('task-form-title').textContent = 'Add Task';
  populateCategoryCheckboxes();
  document.getElementById('new-category-row').hidden = true;
  clearErrors();
  overlay.hidden = false;
  document.getElementById('task-title').focus();
}

function openEditForm(task) {
  form.reset();
  document.getElementById('task-id').value = task.taskId;
  document.getElementById('task-form-title').textContent = 'Edit Task';
  document.getElementById('task-title').value = task.title;
  document.getElementById('task-description').value = task.description || '';
  document.getElementById('task-priority').value = task.priority;
  document.getElementById('task-status').value = task.status;
  document.getElementById('task-due-date').value = toDateInputValue(task.dueDate);
  populateCategoryCheckboxes(task.categories.map((c) => c.categoryId));
  document.getElementById('new-category-row').hidden = true;
  clearErrors();
  overlay.hidden = false;
  document.getElementById('task-title').focus();
}

function closeForm() {
  overlay.hidden = true;
  form.reset();
  clearErrors();
  document.getElementById('new-category-row').hidden = true;
  document.getElementById('form-error').textContent = '';
}

async function handleComplete(taskId) {
  try {
    await api.completeTask(taskId);
    showStatusMessage('Task marked complete.');
    await loadTasks();
  } catch (err) {
    showStatusMessage(err.message, true);
  }
}

async function handleDelete(taskId) {
  if (!window.confirm('Delete this task? This cannot be undone.')) return;
  try {
    await api.deleteTask(taskId);
    showStatusMessage('Task deleted.');
    await loadTasks();
  } catch (err) {
    showStatusMessage(err.message, true);
  }
}

async function handleFormSubmit(event) {
  event.preventDefault();
  const values = getFormValues();
  const errors = validateForm(values);

  if (Object.keys(errors).length > 0) {
    showFormErrors(errors);
    return;
  }

  const payload = {
    title: values.title,
    description: values.description,
    priority: values.priority,
    status: values.status,
    dueDate: values.dueDate,
    categoryIds: values.categoryIds,
  };

  try {
    if (values.taskId) {
      await api.updateTask(values.taskId, payload);
      showStatusMessage('Task updated.');
    } else {
      await api.createTask(payload);
      showStatusMessage('Task created.');
    }
    closeForm();
    await loadTasks();
  } catch (err) {
    document.getElementById('form-error').textContent = err.message;
  }
}

async function handleSaveCategory() {
  const nameInput = document.getElementById('new-category-name');
  const name = nameInput.value.trim();
  if (!name) return;

  try {
    const { category } = await api.createCategory(name);
    await loadCategories();
    populateCategoryCheckboxes([...getCheckedCategoryIds(), category.categoryId]);
    document.getElementById('new-category-row').hidden = true;
    nameInput.value = '';
  } catch (err) {
    document.getElementById('form-error').textContent = err.message;
  }
}

function wireUpEvents() {
  document.getElementById('add-task-btn').addEventListener('click', openCreateForm);
  document.getElementById('cancel-form-btn').addEventListener('click', closeForm);
  document.getElementById('logout-btn').addEventListener('click', () => api.logout());
  form.addEventListener('submit', handleFormSubmit);

  document.getElementById('new-category-btn').addEventListener('click', () => {
    document.getElementById('new-category-row').hidden = false;
    document.getElementById('new-category-name').focus();
  });
  document.getElementById('cancel-category-btn').addEventListener('click', () => {
    document.getElementById('new-category-row').hidden = true;
    document.getElementById('new-category-name').value = '';
  });
  document.getElementById('save-category-btn').addEventListener('click', handleSaveCategory);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeForm();
  });

  const applyTitleFilter = debounce(async (value) => {
    currentFilters.title = value.trim();
    await loadTasks();
  }, 350);

  document.getElementById('filter-title').addEventListener('input', (event) => {
    applyTitleFilter(event.target.value);
  });

  document.getElementById('filter-status').addEventListener('change', async (event) => {
    currentFilters.status = event.target.value;
    await loadTasks();
  });

  document.getElementById('filter-priority').addEventListener('change', async (event) => {
    currentFilters.priority = event.target.value;
    await loadTasks();
  });

  document.getElementById('filter-category').addEventListener('change', async (event) => {
    currentFilters.categoryId = event.target.value;
    await loadTasks();
  });

  document.getElementById('filter-due-date').addEventListener('change', async (event) => {
    currentFilters.dueDate = event.target.value;
    await loadTasks();
  });

  document.getElementById('clear-filters-btn').addEventListener('click', async () => {
    currentFilters.title = '';
    currentFilters.status = '';
    currentFilters.priority = '';
    currentFilters.categoryId = '';
    currentFilters.dueDate = '';
    document.getElementById('filter-title').value = '';
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-priority').value = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-due-date').value = '';
    await loadTasks();
  });

  document.getElementById('sort-select').addEventListener('change', (event) => {
    currentSort = event.target.value;
    renderTasks(sortTasks(currentTasks, currentSort));
  });
}

async function init() {
  wireUpEvents();

  if (!api.isAuthenticated()) {
    redirectToLogin();
    return;
  }

  try {
    await loadCategories();
    await loadTasks();
  } catch (err) {
    showStatusMessage(err.message, true);
  }
}

init();
