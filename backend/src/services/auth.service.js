const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const userModel = require('../models/user.model');
const passwordResetModel = require('../models/passwordReset.model');
const passwordHistoryModel = require('../models/passwordHistory.model');
const config = require('../config/env');
const HttpError = require('../utils/HttpError');

const SALT_ROUNDS = 10;
const TOKEN_TTL = '1h';
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MINUTES = 15;
const PASSWORD_HISTORY_LIMIT = 5;
const GENERIC_FORGOT_MESSAGE =
  'If an account exists for this email, a reset token has been generated. Check the server console.';
const INVALID_RESET_MESSAGE = 'Invalid or expired reset token';
const PASSWORD_REUSE_MESSAGE = `You cannot reuse any of your last ${PASSWORD_HISTORY_LIMIT} passwords`;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function register({ username, email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  try {
    const user = await userModel.create({ username: username.trim(), email: normalizedEmail, passwordHash });
    await passwordHistoryModel.record(user.userId, passwordHash);
    return user;
  } catch (err) {
    if (err.errorNum === 1 || /ORA-00001/.test(err.message)) {
      if (/UQ_USERS_USERNAME/i.test(err.message)) {
        throw new HttpError(409, 'This username is already taken');
      }
      throw new HttpError(409, 'An account with this email already exists');
    }
    throw err;
  }
}

async function login({ identifier, password }) {
  const trimmedIdentifier = identifier.trim();
  const user = trimmedIdentifier.includes('@')
    ? await userModel.findByEmail(trimmedIdentifier.toLowerCase())
    : await userModel.findByUsername(trimmedIdentifier);

  if (!user) {
    throw new HttpError(401, 'Invalid email/username or password');
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) {
    throw new HttpError(401, 'Invalid email/username or password');
  }

  const token = jwt.sign({ sub: user.userId, email: user.email }, config.jwtSecret, {
    expiresIn: TOKEN_TTL,
  });

  return { token, user: { userId: user.userId, username: user.username, email: user.email } };
}

async function forgotPassword(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await userModel.findByEmail(normalizedEmail);

  if (user) {
    const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    await passwordResetModel.invalidateActiveTokensForUser(user.userId);
    await passwordResetModel.create({ userId: user.userId, tokenHash, expiresAt });

    // Dev-only stand-in for emailing the reset link (see project decisions: email
    // sending is out of scope). This is a live, single-use credential -- never log
    // it somewhere a real deployment's log aggregator would capture.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[Password Reset] Token for ${user.email}: ${token} (expires in ${RESET_TOKEN_TTL_MINUTES} min)`);
    }
  }

  return { message: GENERIC_FORGOT_MESSAGE };
}

async function resetPassword({ email, token, newPassword }) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await userModel.findByEmail(normalizedEmail);

  if (!user) {
    throw new HttpError(400, INVALID_RESET_MESSAGE);
  }

  const tokenHash = hashToken(token);
  const resetRow = await passwordResetModel.findByUserAndTokenHash(user.userId, tokenHash);

  if (!resetRow || resetRow.usedAt || new Date(resetRow.expiresAt) < new Date()) {
    throw new HttpError(400, INVALID_RESET_MESSAGE);
  }

  const recentHashes = await passwordHistoryModel.getRecentHashes(user.userId, PASSWORD_HISTORY_LIMIT);
  for (const oldHash of recentHashes) {
    const reused = await bcrypt.compare(newPassword, oldHash);
    if (reused) {
      throw new HttpError(400, PASSWORD_REUSE_MESSAGE);
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await userModel.updatePasswordHash(user.userId, passwordHash);
  await passwordResetModel.markUsed(resetRow.resetId);
  await passwordHistoryModel.record(user.userId, passwordHash);
  await passwordHistoryModel.pruneOldEntries(user.userId, PASSWORD_HISTORY_LIMIT);
}

module.exports = { register, login, forgotPassword, resetPassword };
