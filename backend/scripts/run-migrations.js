const fs = require('fs');
const path = require('path');
const oracledb = require('oracledb');
const config = require('../src/config/env');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

function splitStatements(sql) {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function run() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const connection = await oracledb.getConnection({
    user: config.oracle.user,
    password: config.oracle.password,
    connectString: config.oracle.connectString,
  });

  try {
    for (const file of files) {
      const statements = splitStatements(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));

      console.log(`Applying ${file} (${statements.length} statement${statements.length === 1 ? '' : 's'})`);

      for (const statement of statements) {
        await connection.execute(statement);
      }
    }

    await connection.commit();
    console.log('All migrations applied successfully.');
  } finally {
    await connection.close();
  }
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
