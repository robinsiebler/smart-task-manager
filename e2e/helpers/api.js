function uniqueSuffix() {
  return `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_PASSWORD = 'TestPass123';

async function registerUser(request, prefix) {
  const suffix = uniqueSuffix();
  const username = `${prefix}${suffix}`;
  const email = `${prefix}.${suffix}@example.com`;

  const response = await request.post('/api/users/register', {
    data: { username, email, password: DEFAULT_PASSWORD },
  });
  const body = await response.json();
  return { userId: body.user.userId, username, email, password: DEFAULT_PASSWORD };
}

async function createCategory(request, token, name) {
  const response = await request.post('/api/categories', {
    headers: { Authorization: `Bearer ${token}` },
    data: { name },
  });
  const body = await response.json();
  return body.category;
}

async function loginForToken(request, identifier, password) {
  const response = await request.post('/api/users/login', {
    data: { identifier, password },
  });
  const body = await response.json();
  return body.token;
}

async function createTask(request, token, overrides = {}) {
  const response = await request.post('/api/tasks', {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title: 'Task',
      priority: 'Medium',
      dueDate: '2026-08-01',
      ...overrides,
    },
  });
  const body = await response.json();
  return body.task;
}

module.exports = { uniqueSuffix, registerUser, createCategory, createTask, loginForToken, DEFAULT_PASSWORD };
