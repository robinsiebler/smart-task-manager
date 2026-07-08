const bcrypt = require('bcrypt');
const userModel = require('../models/user.model');
const passwordHistoryModel = require('../models/passwordHistory.model');
const HttpError = require('../utils/HttpError');

const SALT_ROUNDS = 10;
const PASSWORD_HISTORY_LIMIT = 5;
const PASSWORD_REUSE_MESSAGE = `You cannot reuse any of your last ${PASSWORD_HISTORY_LIMIT} passwords`;

function toPublicUser(user) {
  return { userId: user.userId, username: user.username, email: user.email, createdDate: user.createdDate };
}

async function getProfile(userId) {
  const user = await userModel.findById(userId);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }
  return toPublicUser(user);
}

async function updateProfile(userId, { username, email }) {
  try {
    const updated = await userModel.updateProfile(userId, {
      username: username !== undefined ? username.trim() : undefined,
      email: email !== undefined ? email.trim().toLowerCase() : undefined,
    });
    return toPublicUser(updated);
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

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await userModel.findById(userId);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  const currentMatches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!currentMatches) {
    throw new HttpError(401, 'Current password is incorrect');
  }

  const recentHashes = await passwordHistoryModel.getRecentHashes(userId, PASSWORD_HISTORY_LIMIT);
  for (const oldHash of recentHashes) {
    const reused = await bcrypt.compare(newPassword, oldHash);
    if (reused) {
      throw new HttpError(400, PASSWORD_REUSE_MESSAGE);
    }
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await userModel.updatePasswordHash(userId, passwordHash);
  await passwordHistoryModel.record(userId, passwordHash);
  await passwordHistoryModel.pruneOldEntries(userId, PASSWORD_HISTORY_LIMIT);
}

async function deleteAccount(userId, password) {
  const user = await userModel.findById(userId);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    throw new HttpError(401, 'Password is incorrect');
  }

  await userModel.remove(userId);
}

module.exports = { getProfile, updateProfile, changePassword, deleteAccount };
