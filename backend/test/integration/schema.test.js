const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const oracledb = require('oracledb');
const { initPool, closePool, getPool } = require('../../src/config/db');

let testUserId;

async function withConnection(fn) {
  const connection = await getPool().getConnection();
  try {
    return await fn(connection);
  } finally {
    await connection.close();
  }
}

before(async () => {
  await initPool();
});

after(async () => {
  await closePool();
});

beforeEach(async () => {
  await withConnection(async (connection) => {
    const result = await connection.execute(
      `INSERT INTO users (username, email, password_hash)
       VALUES (:username, :email, :password_hash)
       RETURNING user_id INTO :user_id`,
      {
        username: 'Schema Test User',
        email: `schema.test.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`,
        password_hash: 'not-a-real-hash',
        user_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    testUserId = result.outBinds.user_id[0];
  });
});

afterEach(async () => {
  await withConnection(async (connection) => {
    await connection.execute('DELETE FROM users WHERE user_id = :user_id', { user_id: testUserId });
  });
});

test('pool can connect to the database', async () => {
  await withConnection(async (connection) => {
    const result = await connection.execute('SELECT 1 AS ok FROM dual');
    assert.equal(result.rows[0].OK, 1);
  });
});

test('rejects a task with an invalid priority', async () => {
  await withConnection(async (connection) => {
    await assert.rejects(
      connection.execute(
        `INSERT INTO tasks (user_id, title, priority, status, due_date)
         VALUES (:user_id, 'Bad priority', 'Urgent', 'Pending', SYSDATE)`,
        { user_id: testUserId }
      ),
      /ORA-02290/
    );
  });
});

test('rejects a task with an invalid status', async () => {
  await withConnection(async (connection) => {
    await assert.rejects(
      connection.execute(
        `INSERT INTO tasks (user_id, title, priority, status, due_date)
         VALUES (:user_id, 'Bad status', 'High', 'Done', SYSDATE)`,
        { user_id: testUserId }
      ),
      /ORA-02290/
    );
  });
});

test('accepts a task with a valid priority and status', async () => {
  await withConnection(async (connection) => {
    const result = await connection.execute(
      `INSERT INTO tasks (user_id, title, priority, status, due_date)
       VALUES (:user_id, 'Valid task', 'High', 'Pending', SYSDATE)
       RETURNING task_id INTO :task_id`,
      {
        user_id: testUserId,
        task_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    assert.ok(result.outBinds.task_id[0] > 0);
  });
});

test('deleting a category sets its tasks category_id to NULL instead of deleting them', async () => {
  await withConnection(async (connection) => {
    const categoryResult = await connection.execute(
      `INSERT INTO categories (user_id, name) VALUES (:user_id, 'Temp Category')
       RETURNING category_id INTO :category_id`,
      {
        user_id: testUserId,
        category_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    const categoryId = categoryResult.outBinds.category_id[0];

    const taskResult = await connection.execute(
      `INSERT INTO tasks (user_id, category_id, title, priority, status, due_date)
       VALUES (:user_id, :category_id, 'Categorized task', 'Medium', 'Pending', SYSDATE)
       RETURNING task_id INTO :task_id`,
      {
        user_id: testUserId,
        category_id: categoryId,
        task_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    const taskId = taskResult.outBinds.task_id[0];

    await connection.execute('DELETE FROM categories WHERE category_id = :category_id', {
      category_id: categoryId,
    });

    const check = await connection.execute('SELECT category_id FROM tasks WHERE task_id = :task_id', {
      task_id: taskId,
    });
    assert.equal(check.rows[0].CATEGORY_ID, null);
  });
});

test('deleting a user cascades to their categories and tasks', async () => {
  let categoryId;
  let taskId;

  await withConnection(async (connection) => {
    const categoryResult = await connection.execute(
      `INSERT INTO categories (user_id, name) VALUES (:user_id, 'Cascade Category')
       RETURNING category_id INTO :category_id`,
      {
        user_id: testUserId,
        category_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    categoryId = categoryResult.outBinds.category_id[0];

    const taskResult = await connection.execute(
      `INSERT INTO tasks (user_id, category_id, title, priority, status, due_date)
       VALUES (:user_id, :category_id, 'Cascade task', 'Low', 'Pending', SYSDATE)
       RETURNING task_id INTO :task_id`,
      {
        user_id: testUserId,
        category_id: categoryId,
        task_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    taskId = taskResult.outBinds.task_id[0];

    await connection.execute('DELETE FROM users WHERE user_id = :user_id', { user_id: testUserId });
  });

  await withConnection(async (connection) => {
    const categoryCheck = await connection.execute(
      'SELECT category_id FROM categories WHERE category_id = :category_id',
      { category_id: categoryId }
    );
    assert.equal(categoryCheck.rows.length, 0);

    const taskCheck = await connection.execute('SELECT task_id FROM tasks WHERE task_id = :task_id', {
      task_id: taskId,
    });
    assert.equal(taskCheck.rows.length, 0);
  });

  testUserId = null; // already deleted above; afterEach delete of null id is a no-op
});

test('enforces unique (user_id, name) on categories', async () => {
  await withConnection(async (connection) => {
    await connection.execute("INSERT INTO categories (user_id, name) VALUES (:user_id, 'Duplicate')", {
      user_id: testUserId,
    });
    await assert.rejects(
      connection.execute("INSERT INTO categories (user_id, name) VALUES (:user_id, 'Duplicate')", {
        user_id: testUserId,
      }),
      /ORA-00001/
    );
  });
});

test('enforces unique email on users', async () => {
  await withConnection(async (connection) => {
    const email = `dup.${Date.now()}@example.com`;
    await connection.execute(
      "INSERT INTO users (username, email, password_hash) VALUES ('Dup Username A', :email, 'hash')",
      { email }
    );
    await assert.rejects(
      connection.execute(
        "INSERT INTO users (username, email, password_hash) VALUES ('Dup Username B', :email, 'hash')",
        { email }
      ),
      /ORA-00001/
    );
    await connection.execute('DELETE FROM users WHERE email = :email', { email });
  });
});

test('enforces unique username on users', async () => {
  await withConnection(async (connection) => {
    const username = `dup-username-${Date.now()}`;
    const emailA = `dup-username-a.${Date.now()}@example.com`;
    const emailB = `dup-username-b.${Date.now()}@example.com`;
    await connection.execute('INSERT INTO users (username, email, password_hash) VALUES (:username, :email, \'hash\')', {
      username,
      email: emailA,
    });
    await assert.rejects(
      connection.execute('INSERT INTO users (username, email, password_hash) VALUES (:username, :email, \'hash\')', {
        username,
        email: emailB,
      }),
      /ORA-00001/
    );
    await connection.execute('DELETE FROM users WHERE username = :username', { username });
  });
});
