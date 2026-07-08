const oracledb = require('oracledb');
const { getPool } = require('../config/db');

const SELECT_COLUMNS = 'task_id, user_id, category_id, title, description, priority, status, due_date, created_date';

function mapTaskRow(row) {
  if (!row) return undefined;
  return {
    taskId: row.TASK_ID,
    userId: row.USER_ID,
    categoryId: row.CATEGORY_ID,
    title: row.TITLE,
    description: row.DESCRIPTION,
    priority: row.PRIORITY,
    status: row.STATUS,
    dueDate: row.DUE_DATE,
    createdDate: row.CREATED_DATE,
  };
}

async function findAllByUser(userId) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      `SELECT ${SELECT_COLUMNS} FROM tasks WHERE user_id = :userId ORDER BY due_date ASC, task_id ASC`,
      { userId }
    );
    return result.rows.map(mapTaskRow);
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
    return mapTaskRow(result.rows[0]);
  } finally {
    await connection.close();
  }
}

async function create({ userId, title, description, categoryId, priority, status, dueDate }) {
  const connection = await getPool().getConnection();
  let taskId;
  try {
    const result = await connection.execute(
      `INSERT INTO tasks (user_id, category_id, title, description, priority, status, due_date)
       VALUES (:userId, :categoryId, :title, :description, :priority, :status, :dueDate)
       RETURNING task_id INTO :taskId`,
      {
        userId,
        categoryId,
        title,
        description,
        priority,
        status,
        dueDate,
        taskId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    taskId = result.outBinds.taskId[0];
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
  if (fields.categoryId !== undefined) {
    setClauses.push('category_id = :categoryId');
    binds.categoryId = fields.categoryId;
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

  if (setClauses.length === 0) {
    return findByIdForUser(taskId, userId);
  }

  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      `UPDATE tasks SET ${setClauses.join(', ')} WHERE task_id = :taskId AND user_id = :userId`,
      binds
    );
    if (result.rowsAffected === 0) {
      return undefined;
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

async function categoryBelongsToUser(categoryId, userId) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      'SELECT category_id FROM categories WHERE category_id = :categoryId AND user_id = :userId',
      { categoryId, userId }
    );
    return result.rows.length > 0;
  } finally {
    await connection.close();
  }
}

module.exports = { findAllByUser, findByIdForUser, create, update, remove, categoryBelongsToUser };
