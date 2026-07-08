const oracledb = require('oracledb');
const { getPool } = require('../config/db');

const SELECT_COLUMNS = 'task_id, user_id, title, description, priority, status, due_date, created_date';

function mapTaskRow(row) {
  if (!row) return undefined;
  return {
    taskId: row.TASK_ID,
    userId: row.USER_ID,
    title: row.TITLE,
    description: row.DESCRIPTION,
    priority: row.PRIORITY,
    status: row.STATUS,
    dueDate: row.DUE_DATE,
    createdDate: row.CREATED_DATE,
    categories: [],
  };
}

function indexedBinds(ids) {
  const bindNames = ids.map((_, i) => `:id${i}`);
  const binds = Object.fromEntries(ids.map((id, i) => [`id${i}`, id]));
  return { bindNames, binds };
}

async function attachCategories(connection, tasks) {
  if (tasks.length === 0) return tasks;

  const tasksById = new Map(tasks.map((task) => [task.taskId, task]));
  const { bindNames, binds } = indexedBinds(tasks.map((task) => task.taskId));

  const result = await connection.execute(
    `SELECT tc.task_id, c.category_id, c.name
     FROM task_categories tc
     JOIN categories c ON c.category_id = tc.category_id
     WHERE tc.task_id IN (${bindNames.join(', ')})
     ORDER BY c.name ASC`,
    binds
  );

  for (const row of result.rows) {
    const task = tasksById.get(row.TASK_ID);
    if (task) {
      task.categories.push({ categoryId: row.CATEGORY_ID, name: row.NAME });
    }
  }

  return tasks;
}

async function setTaskCategories(connection, taskId, categoryIds) {
  await connection.execute('DELETE FROM task_categories WHERE task_id = :taskId', { taskId });
  for (const categoryId of categoryIds) {
    await connection.execute('INSERT INTO task_categories (task_id, category_id) VALUES (:taskId, :categoryId)', {
      taskId,
      categoryId,
    });
  }
}

async function findAllByUser(userId, filters = {}) {
  const whereClauses = ['user_id = :userId'];
  const binds = { userId };

  if (filters.title !== undefined) {
    whereClauses.push("UPPER(title) LIKE UPPER(:title) ESCAPE '\\'");
    binds.title = `%${filters.title.replace(/[\\%_]/g, '\\$&')}%`;
  }
  if (filters.status !== undefined) {
    whereClauses.push('status = :status');
    binds.status = filters.status;
  }
  if (filters.priority !== undefined) {
    whereClauses.push('priority = :priority');
    binds.priority = filters.priority;
  }
  if (filters.categoryId !== undefined) {
    whereClauses.push(
      'EXISTS (SELECT 1 FROM task_categories tc WHERE tc.task_id = tasks.task_id AND tc.category_id = :categoryId)'
    );
    binds.categoryId = filters.categoryId;
  }
  if (filters.dueDate !== undefined) {
    whereClauses.push('due_date = :dueDate');
    binds.dueDate = filters.dueDate;
  }

  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      `SELECT ${SELECT_COLUMNS} FROM tasks WHERE ${whereClauses.join(' AND ')} ORDER BY due_date ASC, task_id ASC`,
      binds
    );
    const tasks = result.rows.map(mapTaskRow);
    return await attachCategories(connection, tasks);
  } finally {
    await connection.close();
  }
}

async function findByIdForUser(taskId, userId) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      `SELECT ${SELECT_COLUMNS} FROM tasks WHERE task_id = :taskId AND user_id = :userId`,
      { taskId, userId }
    );
    const tasks = result.rows.map(mapTaskRow);
    const [task] = await attachCategories(connection, tasks);
    return task;
  } finally {
    await connection.close();
  }
}

async function create({ userId, title, description, priority, status, dueDate, categoryIds = [] }) {
  const connection = await getPool().getConnection();
  let taskId;
  try {
    const result = await connection.execute(
      `INSERT INTO tasks (user_id, title, description, priority, status, due_date)
       VALUES (:userId, :title, :description, :priority, :status, :dueDate)
       RETURNING task_id INTO :taskId`,
      {
        userId,
        title,
        description,
        priority,
        status,
        dueDate,
        taskId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    taskId = result.outBinds.taskId[0];
    await setTaskCategories(connection, taskId, categoryIds);
  } finally {
    await connection.close();
  }
  return findByIdForUser(taskId, userId);
}

async function update(taskId, userId, fields) {
  const setClauses = [];
  const binds = { taskId, userId };

  if (fields.title !== undefined) {
    setClauses.push('title = :title');
    binds.title = fields.title;
  }
  if (fields.description !== undefined) {
    setClauses.push('description = :description');
    binds.description = fields.description;
  }
  if (fields.priority !== undefined) {
    setClauses.push('priority = :priority');
    binds.priority = fields.priority;
  }
  if (fields.status !== undefined) {
    setClauses.push('status = :status');
    binds.status = fields.status;
  }
  if (fields.dueDate !== undefined) {
    setClauses.push('due_date = :dueDate');
    binds.dueDate = fields.dueDate;
  }

  const connection = await getPool().getConnection();
  try {
    if (setClauses.length > 0) {
      const result = await connection.execute(
        `UPDATE tasks SET ${setClauses.join(', ')} WHERE task_id = :taskId AND user_id = :userId`,
        binds
      );
      if (result.rowsAffected === 0) {
        return undefined;
      }
    } else {
      const ownershipCheck = await connection.execute(
        'SELECT task_id FROM tasks WHERE task_id = :taskId AND user_id = :userId',
        { taskId, userId }
      );
      if (ownershipCheck.rows.length === 0) {
        return undefined;
      }
    }

    if (fields.categoryIds !== undefined) {
      await setTaskCategories(connection, taskId, fields.categoryIds);
    }
  } finally {
    await connection.close();
  }

  return findByIdForUser(taskId, userId);
}

async function remove(taskId, userId) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute('DELETE FROM tasks WHERE task_id = :taskId AND user_id = :userId', {
      taskId,
      userId,
    });
    return result.rowsAffected > 0;
  } finally {
    await connection.close();
  }
}

async function countOwnedCategories(categoryIds, userId) {
  if (categoryIds.length === 0) return 0;
  const connection = await getPool().getConnection();
  try {
    const { bindNames, binds } = indexedBinds(categoryIds);
    binds.userId = userId;
    const result = await connection.execute(
      `SELECT COUNT(*) AS cnt FROM categories WHERE user_id = :userId AND category_id IN (${bindNames.join(', ')})`,
      binds
    );
    return result.rows[0].CNT;
  } finally {
    await connection.close();
  }
}

module.exports = { findAllByUser, findByIdForUser, create, update, remove, countOwnedCategories };
