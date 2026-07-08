const { getPool } = require('../config/db');

async function invalidateActiveTokensForUser(userId) {
  const connection = await getPool().getConnection();
  try {
    await connection.execute(
      `UPDATE password_resets
       SET used_at = SYS_EXTRACT_UTC(SYSTIMESTAMP)
       WHERE user_id = :userId AND used_at IS NULL`,
      { userId }
    );
  } finally {
    await connection.close();
  }
}

async function create({ userId, tokenHash, expiresAt }) {
  const connection = await getPool().getConnection();
  try {
    await connection.execute(
      `INSERT INTO password_resets (user_id, token_hash, expires_at)
       VALUES (:userId, :tokenHash, :expiresAt)`,
      { userId, tokenHash, expiresAt }
    );
  } finally {
    await connection.close();
  }
}

async function findByUserAndTokenHash(userId, tokenHash) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      `SELECT reset_id, expires_at, used_at
       FROM password_resets
       WHERE user_id = :userId AND token_hash = :tokenHash
       ORDER BY created_date DESC
       FETCH FIRST 1 ROW ONLY`,
      { userId, tokenHash }
    );
    const row = result.rows[0];
    if (!row) return undefined;
    return {
      resetId: row.RESET_ID,
      expiresAt: row.EXPIRES_AT,
      usedAt: row.USED_AT,
    };
  } finally {
    await connection.close();
  }
}

async function markUsed(resetId) {
  const connection = await getPool().getConnection();
  try {
    await connection.execute(
      'UPDATE password_resets SET used_at = SYS_EXTRACT_UTC(SYSTIMESTAMP) WHERE reset_id = :resetId',
      { resetId }
    );
  } finally {
    await connection.close();
  }
}

module.exports = { invalidateActiveTokensForUser, create, findByUserAndTokenHash, markUsed };
