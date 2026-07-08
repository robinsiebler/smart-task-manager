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
      `INSERT INTO users (username, email, password_hash)
       VALUES (:username, :email, 'not-a-real-hash')
       RETURNING user_id INTO :userId`,
      {
        username: `Test ${prefix}`,
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

test('rejects requests with no Authorization header', async () => {
  const response = await fetch(`${baseUrl}/api/categories`);
  assert.equal(response.status, 401);
});

test('creates a category and returns it', async () => {
  const user = await createTestUser('createcat');
  const response = await authedRequest(user.token, '/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name: 'Work' }),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.category.name, 'Work');
  assert.equal(body.category.userId, user.userId);
});

test('rejects a category with a missing name', async () => {
  const user = await createTestUser('nonamecat');
  const response = await authedRequest(user.token, '/api/categories', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /Category name is required/);
});

test('rejects a duplicate category name for the same user', async () => {
  const user = await createTestUser('dupcat');
  await authedRequest(user.token, '/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name: 'Personal' }),
  });

  const response = await authedRequest(user.token, '/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name: 'Personal' }),
  });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /already exists/);
});

test('allows the same category name across different users', async () => {
  const userA = await createTestUser('samenamea');
  const userB = await createTestUser('samenameb');

  const responseA = await authedRequest(userA.token, '/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name: 'Errands' }),
  });
  const responseB = await authedRequest(userB.token, '/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name: 'Errands' }),
  });

  assert.equal(responseA.status, 201);
  assert.equal(responseB.status, 201);
});

test('deletes a category and returns 204', async () => {
  const user = await createTestUser('deletecat');
  const createResponse = await authedRequest(user.token, '/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name: 'Temporary' }),
  });
  const { category } = await createResponse.json();

  const deleteResponse = await authedRequest(user.token, `/api/categories/${category.categoryId}`, {
    method: 'DELETE',
  });
  assert.equal(deleteResponse.status, 204);

  const listResponse = await authedRequest(user.token, '/api/categories');
  const listBody = await listResponse.json();
  assert.deepEqual(
    listBody.categories.map((c) => c.categoryId),
    []
  );
});

test('rejects deleting a category that belongs to another user', async () => {
  const owner = await createTestUser('catdelowner');
  const attacker = await createTestUser('catdelattacker');
  const createResponse = await authedRequest(owner.token, '/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name: 'Owned' }),
  });
  const { category } = await createResponse.json();

  const deleteResponse = await authedRequest(attacker.token, `/api/categories/${category.categoryId}`, {
    method: 'DELETE',
  });
  assert.equal(deleteResponse.status, 404);

  const listResponse = await authedRequest(owner.token, '/api/categories');
  const listBody = await listResponse.json();
  assert.deepEqual(
    listBody.categories.map((c) => c.categoryId),
    [category.categoryId]
  );
});

test('rejects deleting a nonexistent category', async () => {
  const user = await createTestUser('catdelmissing');
  const response = await authedRequest(user.token, '/api/categories/999999999', { method: 'DELETE' });
  assert.equal(response.status, 404);
});

test('rejects deleting a category with an invalid id', async () => {
  const user = await createTestUser('catdelbadid');
  const response = await authedRequest(user.token, '/api/categories/not-a-number', { method: 'DELETE' });
  assert.equal(response.status, 400);
});

test('deleting a category removes it from a task but leaves the task and its other categories intact', async () => {
  const user = await createTestUser('catdeltask');
  const workResponse = await authedRequest(user.token, '/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name: 'Work' }),
  });
  const personalResponse = await authedRequest(user.token, '/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name: 'Personal' }),
  });
  const { category: workCategory } = await workResponse.json();
  const { category: personalCategory } = await personalResponse.json();

  const taskResponse = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Task with two categories',
      priority: 'Medium',
      dueDate: '2026-08-01',
      categoryIds: [workCategory.categoryId, personalCategory.categoryId],
    }),
  });
  const { task } = await taskResponse.json();

  const deleteResponse = await authedRequest(user.token, `/api/categories/${workCategory.categoryId}`, {
    method: 'DELETE',
  });
  assert.equal(deleteResponse.status, 204);

  const getTaskResponse = await authedRequest(user.token, `/api/tasks/${task.taskId}`);
  const getTaskBody = await getTaskResponse.json();
  assert.equal(getTaskResponse.status, 200);
  assert.deepEqual(
    getTaskBody.task.categories.map((c) => c.categoryId),
    [personalCategory.categoryId]
  );
});

test('lists only the requesting user\'s categories, alphabetically', async () => {
  const userA = await createTestUser('listcata');
  const userB = await createTestUser('listcatb');

  await authedRequest(userA.token, '/api/categories', { method: 'POST', body: JSON.stringify({ name: 'Zebra' }) });
  await authedRequest(userA.token, '/api/categories', { method: 'POST', body: JSON.stringify({ name: 'Apple' }) });
  await authedRequest(userB.token, '/api/categories', { method: 'POST', body: JSON.stringify({ name: 'Other' }) });

  const response = await authedRequest(userA.token, '/api/categories');
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(
    body.categories.map((c) => c.name),
    ['Apple', 'Zebra']
  );
});
