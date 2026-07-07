const oracledb = require('oracledb');
const config = require('./env');

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
oracledb.autoCommit = true;

let pool;

async function initPool() {
  pool = await oracledb.createPool({
    user: config.oracle.user,
    password: config.oracle.password,
    connectString: config.oracle.connectString,
    poolMin: config.oracle.poolMin,
    poolMax: config.oracle.poolMax,
    poolIncrement: config.oracle.poolIncrement,
  });
  return pool;
}

async function closePool() {
  if (pool) {
    await pool.close(10);
  }
}

function getPool() {
  if (!pool) {
    throw new Error('Oracle connection pool has not been initialized');
  }
  return pool;
}

module.exports = { initPool, closePool, getPool };
