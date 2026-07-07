const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const userModel = require('../models/user.model');
const config = require('../config/env');
const HttpError = require('../utils/HttpError');

const SALT_ROUNDS = 10;
const TOKEN_TTL = '1h';

async function register({ name, email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    return await userModel.create({ name: name.trim(), email: normalizedEmail, passwordHash });
  } catch (err) {
    if (err.errorNum === 1 || /ORA-00001/.test(err.message)) {
      throw new HttpError(409, 'An account with this email already exists');
    }
    throw err;
  }
}

async function login({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await userModel.findByEmail(normalizedEmail);
  if (!user) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new HttpError(401, 'Invalid email or password');
  }

  const token = jwt.sign({ sub: user.userId, email: user.email }, config.jwtSecret, {
    expiresIn: TOKEN_TTL,
  });

  return { token, user: { userId: user.userId, name: user.name, email: user.email } };
}

module.exports = { register, login };
