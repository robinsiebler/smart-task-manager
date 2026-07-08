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

async function createTestTaskDirect(
  userId,
  { categoryIds = [], title = 'Task', priority = 'Medium', status = 'Pending', dueDate }
) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      `INSERT INTO tasks (user_id, title, priority, status, due_date)
       VALUES (:userId, :title, :priority, :status, :dueDate)
       RETURNING task_id INTO :taskId`,
      { userId, title, priority, status, dueDate, taskId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } }
    );
    const taskId = result.outBinds.taskId[0];
    for (const categoryId of categoryIds) {
      await connection.execute('INSERT INTO task_categories (task_id, category_id) VALUES (:taskId, :categoryId)', {
        taskId,
        categoryId,
      });
    }
    return taskId;
  } finally {
    await connection.close();
  }
}

function listTasks(token, query = '') {
  return authedRequest(token, `/api/tasks${query}`);
}

function daysFromToday(offset) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  date.setUTCHours(0, 0, 0, 0);
  return date;
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
  assert.deepEqual(body.task.categories, []);
});

test('creates a task with multiple categories', async () => {
  const user = await createTestUser('multicat');
  const workId = await createTestCategory(user.userId, 'Work');
  const urgentId = await createTestCategory(user.userId, 'Urgent');

  const response = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ categoryIds: [workId, urgentId] })),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  const returnedIds = body.task.categories.map((c) => c.categoryId).sort();
  assert.deepEqual(returnedIds, [workId, urgentId].sort());
});

test('deduplicates repeated categoryIds on create', async () => {
  const user = await createTestUser('taskdupcat');
  const workId = await createTestCategory(user.userId, 'Work');

  const response = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ categoryIds: [workId, workId] })),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.task.categories.length, 1);
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

test('rejects categoryIds that are not an array of numbers', async () => {
  const user = await createTestUser('badcategoryids');
  const response = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ categoryIds: ['not-a-number'] })),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /categoryIds must be an array of numbers/);
});

test('rejects categoryIds containing negative numbers, zero, or non-integers', async () => {
  const user = await createTestUser('badcategoryidsvalues');

  for (const badValue of [-1, 0, 1.5, NaN]) {
    const response = await authedRequest(user.token, '/api/tasks', {
      method: 'POST',
      body: JSON.stringify(validTaskPayload({ categoryIds: [badValue] })),
    });
    const body = await response.json();

    assert.equal(response.status, 400, `expected 400 for categoryIds: [${badValue}]`);
    assert.match(body.error, /categoryIds must be an array of numbers/);
  }
});

test('rejects a task title over 200 characters', async () => {
  const user = await createTestUser('longtitle');
  const response = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ title: 'x'.repeat(201) })),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /200 characters or fewer/);
});

test('accepts a task title of exactly 200 characters', async () => {
  const user = await createTestUser('maxtitle');
  const response = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ title: 'x'.repeat(200) })),
  });

  assert.equal(response.status, 201);
});

test('rejects a task description over 4000 characters', async () => {
  const user = await createTestUser('longdesc');
  const response = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ description: 'x'.repeat(4001) })),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /4000 characters or fewer/);
});

test('rejects a non-string task description', async () => {
  const user = await createTestUser('badtypedesc');
  const response = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ description: 12345 })),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /Description must be a string/);
});

test('rejects a categoryId that belongs to a different user', async () => {
  const owner = await createTestUser('catowner');
  const attacker = await createTestUser('catattacker');
  const categoryId = await createTestCategory(owner.userId, 'Owner Category');

  const response = await authedRequest(attacker.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ categoryIds: [categoryId] })),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /Invalid category/);
});

test('rejects if any one of several categoryIds does not belong to the user', async () => {
  const owner = await createTestUser('catowner2');
  const attacker = await createTestUser('catattacker2');
  const ownCategoryId = await createTestCategory(attacker.userId, 'My Own Category');
  const othersCategoryId = await createTestCategory(owner.userId, 'Not Mine');

  const response = await authedRequest(attacker.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ categoryIds: [ownCategoryId, othersCategoryId] })),
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
    body: JSON.stringify(validTaskPayload({ categoryIds: [categoryId] })),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.task.categories.length, 1);
  assert.equal(body.task.categories[0].categoryId, categoryId);
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

test('replaces a task\'s categories on update', async () => {
  const user = await createTestUser('updatecat');
  const workId = await createTestCategory(user.userId, 'Work');
  const homeId = await createTestCategory(user.userId, 'Home');

  const createResponse = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ categoryIds: [workId] })),
  });
  const created = (await createResponse.json()).task;

  const response = await authedRequest(user.token, `/api/tasks/${created.taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ categoryIds: [homeId] }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.task.categories.length, 1);
  assert.equal(body.task.categories[0].categoryId, homeId);
});

test('clears a task\'s categories when updated with an empty array', async () => {
  const user = await createTestUser('clearcat');
  const workId = await createTestCategory(user.userId, 'Work');

  const createResponse = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ categoryIds: [workId] })),
  });
  const created = (await createResponse.json()).task;

  const response = await authedRequest(user.token, `/api/tasks/${created.taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ categoryIds: [] }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.task.categories, []);
});

test('leaves categories untouched when categoryIds is omitted from an update', async () => {
  const user = await createTestUser('untouchedcat');
  const workId = await createTestCategory(user.userId, 'Work');

  const createResponse = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ categoryIds: [workId] })),
  });
  const created = (await createResponse.json()).task;

  const response = await authedRequest(user.token, `/api/tasks/${created.taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ title: 'Only title changed' }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.task.categories.length, 1);
  assert.equal(body.task.categories[0].categoryId, workId);
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

test('rejects updating a task title to over 200 characters', async () => {
  const user = await createTestUser('longtitleupdate');
  const createResponse = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload()),
  });
  const created = (await createResponse.json()).task;

  const response = await authedRequest(user.token, `/api/tasks/${created.taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ title: 'x'.repeat(201) }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /200 characters or fewer/);
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

test('deleting a task removes its category associations', async () => {
  const user = await createTestUser('deletecat');
  const workId = await createTestCategory(user.userId, 'Work');

  const createResponse = await authedRequest(user.token, '/api/tasks', {
    method: 'POST',
    body: JSON.stringify(validTaskPayload({ categoryIds: [workId] })),
  });
  const created = (await createResponse.json()).task;

  await authedRequest(user.token, `/api/tasks/${created.taskId}`, { method: 'DELETE' });

  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute('SELECT * FROM task_categories WHERE task_id = :taskId', {
      taskId: created.taskId,
    });
    assert.equal(result.rows.length, 0);
  } finally {
    await connection.close();
  }
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

test('filters by title with a case-insensitive partial match', async () => {
  const user = await createTestUser('filtertitle');
  const dueDate = daysFromToday(10);
  await createTestTaskDirect(user.userId, { title: 'Buy groceries', dueDate });
  await createTestTaskDirect(user.userId, { title: 'Walk the dog', dueDate });

  const response = await listTasks(user.token, '?title=GROCER');
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.tasks.length, 1);
  assert.equal(body.tasks[0].title, 'Buy groceries');
});

test('title filter treats literal % and _ in the search term as literal characters', async () => {
  const user = await createTestUser('filterescape');
  const dueDate = daysFromToday(10);
  await createTestTaskDirect(user.userId, { title: '50% done', dueDate });
  await createTestTaskDirect(user.userId, { title: '50X done', dueDate });

  const response = await listTasks(user.token, `?title=${encodeURIComponent('50% done')}`);
  const body = await response.json();

  assert.equal(body.tasks.length, 1);
  assert.equal(body.tasks[0].title, '50% done');
});

test('filters by status', async () => {
  const user = await createTestUser('filterstatus');
  const dueDate = daysFromToday(10);
  await createTestTaskDirect(user.userId, { status: 'Pending', dueDate });
  await createTestTaskDirect(user.userId, { status: 'Completed', dueDate });

  const response = await listTasks(user.token, '?status=Completed');
  const body = await response.json();

  assert.equal(body.tasks.length, 1);
  assert.equal(body.tasks[0].status, 'Completed');
});

test('filters by priority', async () => {
  const user = await createTestUser('filterpriority');
  const dueDate = daysFromToday(10);
  await createTestTaskDirect(user.userId, { priority: 'High', dueDate });
  await createTestTaskDirect(user.userId, { priority: 'Low', dueDate });

  const response = await listTasks(user.token, '?priority=High');
  const body = await response.json();

  assert.equal(body.tasks.length, 1);
  assert.equal(body.tasks[0].priority, 'High');
});

test('filters by categoryId', async () => {
  const user = await createTestUser('filtercategory');
  const workId = await createTestCategory(user.userId, 'Work');
  const personalId = await createTestCategory(user.userId, 'Personal');
  const dueDate = daysFromToday(10);
  await createTestTaskDirect(user.userId, { categoryIds: [workId], dueDate });
  await createTestTaskDirect(user.userId, { categoryIds: [personalId], dueDate });

  const response = await listTasks(user.token, `?categoryId=${workId}`);
  const body = await response.json();

  assert.equal(body.tasks.length, 1);
  assert.ok(body.tasks[0].categories.some((c) => c.categoryId === workId));
});

test('categoryId filter matches a task that has that category among several', async () => {
  const user = await createTestUser('filtermulticat');
  const workId = await createTestCategory(user.userId, 'Work');
  const urgentId = await createTestCategory(user.userId, 'Urgent');
  const dueDate = daysFromToday(10);
  await createTestTaskDirect(user.userId, { categoryIds: [workId, urgentId], dueDate });
  await createTestTaskDirect(user.userId, { categoryIds: [urgentId], dueDate });

  const response = await listTasks(user.token, `?categoryId=${workId}`);
  const body = await response.json();

  assert.equal(body.tasks.length, 1);
});

test('filters by exact dueDate', async () => {
  const user = await createTestUser('filterduedate');
  const targetDue = daysFromToday(15);
  await createTestTaskDirect(user.userId, { title: 'On target date', dueDate: targetDue });
  await createTestTaskDirect(user.userId, { title: 'Different date', dueDate: daysFromToday(20) });

  const isoDate = targetDue.toISOString().slice(0, 10);
  const response = await listTasks(user.token, `?dueDate=${isoDate}`);
  const body = await response.json();

  assert.equal(body.tasks.length, 1);
  assert.equal(body.tasks[0].title, 'On target date');
});

test('combines multiple filters with AND logic', async () => {
  const user = await createTestUser('filtercombo');
  const workId = await createTestCategory(user.userId, 'Work');
  const dueDate = daysFromToday(10);

  await createTestTaskDirect(user.userId, {
    title: 'Matches everything',
    categoryIds: [workId],
    priority: 'High',
    status: 'Pending',
    dueDate,
  });
  await createTestTaskDirect(user.userId, {
    title: 'Wrong priority',
    categoryIds: [workId],
    priority: 'Low',
    status: 'Pending',
    dueDate,
  });
  await createTestTaskDirect(user.userId, {
    title: 'Wrong category',
    categoryIds: [],
    priority: 'High',
    status: 'Pending',
    dueDate,
  });

  const response = await listTasks(
    user.token,
    `?priority=High&status=Pending&categoryId=${workId}&title=matches`
  );
  const body = await response.json();

  assert.equal(body.tasks.length, 1);
  assert.equal(body.tasks[0].title, 'Matches everything');
});

test('filters never return another user\'s tasks', async () => {
  const userA = await createTestUser('filterisolatea');
  const userB = await createTestUser('filterisolateb');
  const dueDate = daysFromToday(10);

  await createTestTaskDirect(userA.userId, { title: 'Shared title', priority: 'High', dueDate });
  await createTestTaskDirect(userB.userId, { title: 'Shared title', priority: 'High', dueDate });

  const response = await listTasks(userA.token, '?title=Shared');
  const body = await response.json();

  assert.equal(body.tasks.length, 1);
  assert.equal(body.tasks[0].userId, userA.userId);
});

test('rejects an invalid status filter with 400', async () => {
  const user = await createTestUser('badstatusfilter');
  const response = await listTasks(user.token, '?status=NotAStatus');
  assert.equal(response.status, 400);
});

test('rejects an invalid priority filter with 400', async () => {
  const user = await createTestUser('badpriorityfilter');
  const response = await listTasks(user.token, '?priority=Urgent');
  assert.equal(response.status, 400);
});

test('rejects a non-numeric categoryId filter with 400', async () => {
  const user = await createTestUser('badcategoryfilter');
  const response = await listTasks(user.token, '?categoryId=abc');
  assert.equal(response.status, 400);
});

test('rejects an invalid dueDate filter with 400', async () => {
  const user = await createTestUser('baddatefilter');
  const response = await listTasks(user.token, '?dueDate=not-a-date');
  assert.equal(response.status, 400);
});
