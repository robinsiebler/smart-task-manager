const { getPool } = require('../config/db');

async function getRecentHashes(userId, limit) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      `SELECT password_hash
       FROM password_history
       WHERE user_id = :userId
       ORDER BY created_date DESC
       FETCH FIRST :limit ROWS ONLY`,
      { userId, limit }
    );
    return result.rows.map((row) => row.PASSWORD_HASH);
  } finally {
    await connection.close();
  }
}

async function record(userId, passwordHash) {
  const connection = await getPool().getConnection();
  try {
    await connection.execute(
      'INSERT INTO password_history (user_id, password_hash) VALUES (:userId, :passwordHash)',
      { userId, passwordHash }
    );
  } finally {
    await connection.close();
  }
}

async function pruneOldEntries(userId, keep) {
  const connection = await getPool().getConnection();
  try {
    await connection.execute(
      `DELETE FROM password_history
       WHERE user_id = :userId
       AND history_id NOT IN (
         SELECT history_id FROM (
           SELECT history_id FROM password_history
           WHERE user_id = :userId
           ORDER BY created_date DESC
           FETCH FIRST :keep ROWS ONLY
         )
       )`,
      { userId, keep }
    );
  } finally {
    await connection.close();
  }
}

module.exports = { getRecentHashes, record, pruneOldEntries };
