const { getPool, initPool } = require('../../backend/src/config/db');

let poolPromise;

function ensurePool() {
  if (!poolPromise) {
    poolPromise = initPool();
  }
  return poolPromise;
}

async function deleteUser(userId) {
  await ensurePool();
  const connection = await getPool().getConnection();
  try {
    await connection.execute('DELETE FROM users WHERE user_id = :userId', { userId });
  } finally {
    await connection.close();
  }
}

module.exports = { deleteUser };
