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

async function createTestTask(
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

function daysFromToday(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date;
}

function authedGet(token) {
  return fetch(`${baseUrl}/api/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

test('rejects unauthenticated requests', async () => {
  const response = await fetch(`${baseUrl}/api/dashboard`);
  assert.equal(response.status, 401);
});

test('returns zeroed summary and empty breakdowns for a user with no tasks', async () => {
  const user = await createTestUser('empty');
  const response = await authedGet(user.token);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body.dashboard, {
    total: 0,
    completed: 0,
    pending: 0,
    overdue: 0,
    byCategory: [],
    byPriority: [],
  });
});

test('computes total/completed/pending counts across statuses', async () => {
  const user = await createTestUser('statuses');
  const futureDue = daysFromToday(10);

  await createTestTask(user.userId, { status: 'Completed', dueDate: futureDue });
  await createTestTask(user.userId, { status: 'Completed', dueDate: futureDue });
  await createTestTask(user.userId, { status: 'Pending', dueDate: futureDue });
  await createTestTask(user.userId, { status: 'Pending', dueDate: futureDue });
  await createTestTask(user.userId, { status: 'Pending', dueDate: futureDue });
  await createTestTask(user.userId, { status: 'In Progress', dueDate: futureDue });
  await createTestTask(user.userId, { status: 'Cancelled', dueDate: futureDue });

  const response = await authedGet(user.token);
  const body = await response.json();

  assert.equal(body.dashboard.total, 7);
  assert.equal(body.dashboard.completed, 2);
  assert.equal(body.dashboard.pending, 3);
  assert.equal(body.dashboard.overdue, 0);
});

test('counts a task as overdue only when due_date is in the past and status is not Completed', async () => {
  const user = await createTestUser('overdue');

  await createTestTask(user.userId, { status: 'Pending', dueDate: daysFromToday(-5) }); // overdue
  await createTestTask(user.userId, { status: 'Completed', dueDate: daysFromToday(-5) }); // not overdue: completed
  await createTestTask(user.userId, { status: 'Cancelled', dueDate: daysFromToday(-5) }); // overdue: only Completed is excluded
  await createTestTask(user.userId, { status: 'Pending', dueDate: daysFromToday(0) }); // not overdue: due today
  await createTestTask(user.userId, { status: 'Pending', dueDate: daysFromToday(5) }); // not overdue: future

  const response = await authedGet(user.token);
  const body = await response.json();

  assert.equal(body.dashboard.total, 5);
  assert.equal(body.dashboard.overdue, 2);
});

test('breaks tasks down by category, including an Uncategorized bucket', async () => {
  const user = await createTestUser('bycategory');
  const workId = await createTestCategory(user.userId, 'Work');
  const personalId = await createTestCategory(user.userId, 'Personal');
  const futureDue = daysFromToday(10);

  await createTestTask(user.userId, { categoryIds: [workId], dueDate: futureDue });
  await createTestTask(user.userId, { categoryIds: [workId], dueDate: futureDue });
  await createTestTask(user.userId, { categoryIds: [personalId], dueDate: futureDue });
  await createTestTask(user.userId, { categoryIds: [], dueDate: futureDue });

  const response = await authedGet(user.token);
  const body = await response.json();

  const byCategory = Object.fromEntries(body.dashboard.byCategory.map((c) => [c.category, c.count]));
  assert.equal(byCategory.Work, 2);
  assert.equal(byCategory.Personal, 1);
  assert.equal(byCategory.Uncategorized, 1);
});

test('a task with multiple categories contributes to each category\'s count without inflating priority counts', async () => {
  const user = await createTestUser('multicatdash');
  const workId = await createTestCategory(user.userId, 'Work');
  const urgentId = await createTestCategory(user.userId, 'Urgent');
  const futureDue = daysFromToday(10);

  // one task with BOTH categories, plus one single-category task for contrast
  await createTestTask(user.userId, { categoryIds: [workId, urgentId], priority: 'High', dueDate: futureDue });
  await createTestTask(user.userId, { categoryIds: [workId], priority: 'Low', dueDate: futureDue });

  const response = await authedGet(user.token);
  const body = await response.json();

  assert.equal(body.dashboard.total, 2);

  const byCategory = Object.fromEntries(body.dashboard.byCategory.map((c) => [c.category, c.count]));
  assert.equal(byCategory.Work, 2);
  assert.equal(byCategory.Urgent, 1);

  const byPriority = Object.fromEntries(body.dashboard.byPriority.map((p) => [p.priority, p.count]));
  assert.equal(byPriority.High, 1);
  assert.equal(byPriority.Low, 1);
});

test('breaks tasks down by priority', async () => {
  const user = await createTestUser('bypriority');
  const futureDue = daysFromToday(10);

  await createTestTask(user.userId, { priority: 'High', dueDate: futureDue });
  await createTestTask(user.userId, { priority: 'High', dueDate: futureDue });
  await createTestTask(user.userId, { priority: 'Medium', dueDate: futureDue });
  await createTestTask(user.userId, { priority: 'Low', dueDate: futureDue });
  await createTestTask(user.userId, { priority: 'Low', dueDate: futureDue });
  await createTestTask(user.userId, { priority: 'Low', dueDate: futureDue });

  const response = await authedGet(user.token);
  const body = await response.json();

  const byPriority = Object.fromEntries(body.dashboard.byPriority.map((p) => [p.priority, p.count]));
  assert.equal(byPriority.High, 2);
  assert.equal(byPriority.Medium, 1);
  assert.equal(byPriority.Low, 3);
});

test('only includes the requesting user\'s own tasks', async () => {
  const userA = await createTestUser('isolatea');
  const userB = await createTestUser('isolateb');
  const futureDue = daysFromToday(10);

  await createTestTask(userA.userId, { dueDate: futureDue });
  await createTestTask(userA.userId, { dueDate: futureDue });
  await createTestTask(userB.userId, { dueDate: futureDue });
  await createTestTask(userB.userId, { dueDate: futureDue });
  await createTestTask(userB.userId, { dueDate: futureDue });

  const responseA = await authedGet(userA.token);
  const bodyA = await responseA.json();
  const responseB = await authedGet(userB.token);
  const bodyB = await responseB.json();

  assert.equal(bodyA.dashboard.total, 2);
  assert.equal(bodyB.dashboard.total, 3);
});
