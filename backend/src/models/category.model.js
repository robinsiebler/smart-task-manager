const oracledb = require('oracledb');
const { getPool } = require('../config/db');

function mapCategoryRow(row) {
  if (!row) return undefined;
  return {
    categoryId: row.CATEGORY_ID,
    userId: row.USER_ID,
    name: row.NAME,
    createdDate: row.CREATED_DATE,
  };
}

async function findAllByUser(userId) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      'SELECT category_id, user_id, name, created_date FROM categories WHERE user_id = :userId ORDER BY name ASC',
      { userId }
    );
    return result.rows.map(mapCategoryRow);
  } finally {
    await connection.close();
  }
}

async function create({ userId, name }) {
  const connection = await getPool().getConnection();
  let categoryId;
  try {
    const result = await connection.execute(
      'INSERT INTO categories (user_id, name) VALUES (:userId, :name) RETURNING category_id INTO :categoryId',
      { userId, name, categoryId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } }
    );
    categoryId = result.outBinds.categoryId[0];
  } finally {
    await connection.close();
  }
  return { categoryId, userId, name };
}

async function remove(categoryId, userId) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      'DELETE FROM categories WHERE category_id = :categoryId AND user_id = :userId',
      { categoryId, userId }
    );
    return result.rowsAffected > 0;
  } finally {
    await connection.close();
  }
}

module.exports = { findAllByUser, create, remove };
