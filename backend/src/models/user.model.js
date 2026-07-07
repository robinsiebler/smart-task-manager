const oracledb = require('oracledb');
const { getPool } = require('../config/db');

function mapUserRow(row) {
  if (!row) return undefined;
  return {
    userId: row.USER_ID,
    name: row.NAME,
    email: row.EMAIL,
    passwordHash: row.PASSWORD_HASH,
    createdDate: row.CREATED_DATE,
  };
}

async function findByEmail(email) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      `SELECT user_id, name, email, password_hash, created_date
       FROM users
       WHERE email = :email`,
      { email }
    );
    return mapUserRow(result.rows[0]);
  } finally {
    await connection.close();
  }
}

async function create({ name, email, passwordHash }) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      `INSERT INTO users (name, email, password_hash)
       VALUES (:name, :email, :passwordHash)
       RETURNING user_id INTO :userId`,
      {
        name,
        email,
        passwordHash,
        userId: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      }
    );
    return { userId: result.outBinds.userId[0], name, email };
  } finally {
    await connection.close();
  }
}

module.exports = { findByEmail, create };
