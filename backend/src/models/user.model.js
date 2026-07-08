const oracledb = require('oracledb');
const { getPool } = require('../config/db');

function mapUserRow(row) {
  if (!row) return undefined;
  return {
    userId: row.USER_ID,
    username: row.USERNAME,
    email: row.EMAIL,
    passwordHash: row.PASSWORD_HASH,
    createdDate: row.CREATED_DATE,
  };
}

async function findByEmail(email) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      `SELECT user_id, username, email, password_hash, created_date
       FROM users
       WHERE email = :email`,
      { email }
    );
    return mapUserRow(result.rows[0]);
  } finally {
    await connection.close();
  }
}

async function findByUsername(username) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      `SELECT user_id, username, email, password_hash, created_date
       FROM users
       WHERE username = :username`,
      { username }
    );
    return mapUserRow(result.rows[0]);
  } finally {
    await connection.close();
  }
}

async function findById(userId) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      `SELECT user_id, username, email, password_hash, created_date
       FROM users
       WHERE user_id = :userId`,
      { userId }
    );
    return mapUserRow(result.rows[0]);
  } finally {
    await connection.close();
  }
}

async function create({ username, email, passwordHash }) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      `INSERT INTO users (username, email, password_hash)
       VALUES (:username, :email, :passwordHash)
       RETURNING user_id INTO :userId`,
      {
        username,
        email,
        passwordHash,
        userId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    return { userId: result.outBinds.userId[0], username, email };
  } finally {
    await connection.close();
  }
}

async function updatePasswordHash(userId, passwordHash) {
  const connection = await getPool().getConnection();
  try {
    await connection.execute('UPDATE users SET password_hash = :passwordHash WHERE user_id = :userId', {
      passwordHash,
      userId,
    });
  } finally {
    await connection.close();
  }
}

async function updateProfile(userId, fields) {
  const setClauses = [];
  const binds = { userId };

  if (fields.username !== undefined) {
    setClauses.push('username = :username');
    binds.username = fields.username;
  }
  if (fields.email !== undefined) {
    setClauses.push('email = :email');
    binds.email = fields.email;
  }

  if (setClauses.length === 0) {
    return findById(userId);
  }

  const connection = await getPool().getConnection();
  try {
    await connection.execute(`UPDATE users SET ${setClauses.join(', ')} WHERE user_id = :userId`, binds);
  } finally {
    await connection.close();
  }
  return findById(userId);
}

async function remove(userId) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute('DELETE FROM users WHERE user_id = :userId', { userId });
    return result.rowsAffected > 0;
  } finally {
    await connection.close();
  }
}

module.exports = { findByEmail, findByUsername, findById, create, updatePasswordHash, updateProfile, remove };
