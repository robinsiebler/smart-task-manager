const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const required = ['DB_USER', 'DB_PASSWORD', 'DB_CONNECTION_STRING', 'JWT_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  port: process.env.PORT || 3000,
  oracle: {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectString: process.env.DB_CONNECTION_STRING,
    poolMin: Number(process.env.DB_POOL_MIN) || 2,
    poolMax: Number(process.env.DB_POOL_MAX) || 10,
    poolIncrement: Number(process.env.DB_POOL_INCREMENT) || 1,
  },
  jwtSecret: process.env.JWT_SECRET,
};
