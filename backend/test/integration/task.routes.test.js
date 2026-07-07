const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const oracledb = require('oracledb');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const { initPool, closePool, getPool } = require('../../src/config/db');
const config = require('../../src/config/env');

let server;
let baseUrl;
const createdUserIds = [];

before(async () => {
  await initPool();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  const connection = await getPool().getConnection();
  try {
    for (const userId of createdUserIds) {
      await connection.execute('DELETE FROM users WHERE user_id = :userId', { userId });
    }
  } finally {
    await connection.close();
  }
  await new Promise((resolve) => server.close(resolve));
  await closePool();
});

function uniqueEmail(prefix) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
}

async function createTestUser(prefix) {
  const connection = await getPool().getConnection();
  let userId;
  try {
    const result = await connection.execute(
      `INSERT INTO users (name, email, password_hash)
       VALUES (:name, :email, 'not-a-real-hash')
       RETURNING user_id INTO :userId`,
      {
        name: `Test ${prefix}`,
        email: uniqueEmail(prefix),
        userId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    userId = result.outBinds.userId[0];
  } finally {
    await connection.close();
  }
  createdUserIds.push(userId);
  const token = jwt.sign({ sub: userId, email: `${prefix}@example.com` }, config.jwtSecret, { expiresIn: '1h' });
  return { userId, token };
}

async function createTestCategory(userId, name) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      `INSERT INTO categories (user_id, name) VALUES (:userId, :name) RETURNING category_id INTO :categoryId`,
      { userId, name, categoryId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } }
    );
    return result.outBinds.categoryId[0];
  } finally {
    await connection.close();
  }
}

function authedRequest(token, path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
}

function validTaskPayload(overrides = {}) {
  return {
    title: 'Write tests',
    priority: 'High',
    dueDate: '2026-08-01',
    ...overrides,
  };
}

test('rejects requests with no Authorization header', async () => {
  const response = await fetch(`${baseUrl}/api/tasks`);
  assert.equal(response.status, 401);
});

test('creates a task and returns it', async () => {
  const user = await createTestUser('create');
  const response = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ description: 'Cover the CRUD endpoints' })),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.task.title, 'Write tests');
  assert.equal(body.task.description, 'Cover the CRUD endpoints');
  assert.equal(body.task.priority, 'High');
  assert.equal(body.task.status, 'Pending');
  assert.equal(body.task.categoryId, null);
});

test('rejects task creation with a missing title', async () => {
  const user = await createTestUser('notitle');
  const response = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ title: undefined })),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /Title is required/);
});

test('rejects task creation with an invalid priority', async () => {
  const user = await createTestUser('badpriority');
  const response = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ priority: 'Urgent' })),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /Priority must be one of/);
});

test('rejects task creation with an invalid status', async () => {
  const user = await createTestUser('badstatus');
  const response = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ status: 'Done' })),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /Status must be one of/);
});

test('rejects task creation with an invalid dueDate', async () => {
  const user = await createTestUser('baddate');
  const response = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ dueDate: 'not-a-date' })),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /valid dueDate/);
});

test('rejects a categoryId that belongs to a different user', async () => {
  const owner = await createTestUser('catowner');
  const attacker = await createTestUser('catattacker');
  const categoryId = await createTestCategory(owner.userId, 'Owner Category');

  const response = await authedRequest(attacker.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ categoryId })),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /Invalid category/);
});

test('accepts a categoryId that belongs to the requesting user', async () => {
  const user = await createTestUser('catok');
  const categoryId = await createTestCategory(user.userId, 'My Category');

  const response = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ categoryId })),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.task.categoryId, categoryId);
});

test('lists only the requesting user\'s tasks', async () => {
  const userA = await createTestUser('lista');
  const userB = await createTestUser('listb');

  await authedRequest(userA.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ title: 'User A task' })),
  });
  await authedRequest(userB.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ title: 'User B task' })),
  });

  const response = await authedRequest(userA.token, '/api/tasks');
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.tasks.length, 1);
  assert.equal(body.tasks[0].title, 'User A task');
});

test('gets a single task owned by the requester', async () => {
  const user = await createTestUser('getone');
  const createResponse = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload()),
  });
  const created = (await createResponse.json()).task;

  const response = await authedRequest(user.token, `/api/tasks/${created.taskId}`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.task.taskId, created.taskId);
});

test('returns 404 for a task owned by a different user', async () => {
  const owner = await createTestUser('xownerget');
  const attacker = await createTestUser('xattackerget');

  const createResponse = await authedRequest(owner.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload()),
  });
  const created = (await createResponse.json()).task;

  const response = await authedRequest(attacker.token, `/api/tasks/${created.taskId}`);
  assert.equal(response.status, 404);
});

test('returns 404 for a nonexistent task id', async () => {
  const user = await createTestUser('missing');
  const response = await authedRequest(user.token, '/api/tasks/999999999');
  assert.equal(response.status, 404);
});

test('returns 400 for a non-numeric task id', async () => {
  const user = await createTestUser('badid');
  const response = await authedRequest(user.token, '/api/tasks/not-a-number');
  assert.equal(response.status, 400);
});

test('updates a task\'s fields', async () => {
  const user = await createTestUser('update');
  const createResponse = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload()),
  });
  const created = (await createResponse.json()).task;

  const response = await authedRequest(user.token, `/api/tasks/${created.taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ title: 'Updated title', priority: 'Low' }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.task.title, 'Updated title');
  assert.equal(body.task.priority, 'Low');
});

test('rejects an update with no fields', async () => {
  const user = await createTestUser('noop');
  const createResponse = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload()),
  });
  const created = (await createResponse.json()).task;

  const response = await authedRequest(user.token, `/api/tasks/${created.taskId}`, {
    method: 'PUT',
    body: JSON.stringify({}),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /At least one field/);
});

test('returns 404 updating a task owned by a different user', async () => {
  const owner = await createTestUser('xownerput');
  const attacker = await createTestUser('xattackerput');

  const createResponse = await authedRequest(owner.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload()),
  });
  const created = (await createResponse.json()).task;

  const response = await authedRequest(attacker.token, `/api/tasks/${created.taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ title: 'Hijacked' }),
  });
  assert.equal(response.status, 404);
});

test('rejects updating a completed task', async () => {
  const user = await createTestUser('frozen');
  const createResponse = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload()),
  });
  const created = (await createResponse.json()).task;

  await authedRequest(user.token, `/api/tasks/${created.taskId}/complete`, { method: 'PATCH' });

  const response = await authedRequest(user.token, `/api/tasks/${created.taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ title: 'Should not apply' }),
  });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /Completed tasks cannot be modified/);
});

test('marks a task completed', async () => {
  const user = await createTestUser('complete');
  const createResponse = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload()),
  });
  const created = (await createResponse.json()).task;

  const response = await authedRequest(user.token, `/api/tasks/${created.taskId}/complete`, { method: 'PATCH' });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.task.status, 'Completed');
});

test('rejects completing an already-completed task', async () => {
  const user = await createTestUser('doublecomplete');
  const createResponse = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload()),
  });
  const created = (await createResponse.json()).task;

  await authedRequest(user.token, `/api/tasks/${created.taskId}/complete`, { method: 'PATCH' });
  const response = await authedRequest(user.token, `/api/tasks/${created.taskId}/complete`, { method: 'PATCH' });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /already completed/);
});

test('returns 404 completing a task owned by a different user', async () => {
  const owner = await createTestUser('xownercomplete');
  const attacker = await createTestUser('xattackercomplete');

  const createResponse = await authedRequest(owner.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload()),
  });
  const created = (await createResponse.json()).task;

  const response = await authedRequest(attacker.token, `/api/tasks/${created.taskId}/complete`, {
    method: 'PATCH',
  });
  assert.equal(response.status, 404);
});

test('deletes a task', async () => {
  const user = await createTestUser('delete');
  const createResponse = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload()),
  });
  const created = (await createResponse.json()).task;

  const deleteResponse = await authedRequest(user.token, `/api/tasks/${created.taskId}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 204);

  const getResponse = await authedRequest(user.token, `/api/tasks/${created.taskId}`);
  assert.equal(getResponse.status, 404);
});

test('returns 404 deleting a task owned by a different user', async () => {
  const owner = await createTestUser('xownerdelete');
  const attacker = await createTestUser('xattackerdelete');

  const createResponse = await authedRequest(owner.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload()),
  });
  const created = (await createResponse.json()).task;

  const response = await authedRequest(attacker.token, `/api/tasks/${created.taskId}`, { method: 'DELETE' });
  assert.equal(response.status, 404);

  const stillThere = await authedRequest(owner.token, `/api/tasks/${created.taskId}`);
  assert.equal(stillThere.status, 200);
});
