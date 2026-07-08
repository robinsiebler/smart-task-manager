const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const { initPool, closePool, getPool } = require('../../src/config/db');
const config = require('../../src/config/env');

let server;
let baseUrl;
const createdUserIds = [];

before(async () => {
  await initPool();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  const connection = await getPool().getConnection();
  try {
    for (const userId of createdUserIds) {
      await connection.execute('DELETE FROM users WHERE user_id = :userId', { userId });
    }
  } finally {
    await connection.close();
  }
  await new Promise((resolve) => server.close(resolve));
  await closePool();
});

function uniqueSuffix() {
  return `${Date.now()}${Math.random().toString(36).slice(2)}`;
}

const DEFAULT_PASSWORD = 'InitialPass123';

async function createTestUser(prefix) {
  const suffix = uniqueSuffix();
  const username = `${prefix}${suffix}`;
  const email = `${prefix}.${suffix}@example.com`;

  const response = await fetch(`${baseUrl}/api/users/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password: DEFAULT_PASSWORD }),
  });
  const body = await response.json();
  const userId = body.user.userId;
  createdUserIds.push(userId);

  const token = jwt.sign({ sub: userId, email }, config.jwtSecret, { expiresIn: '1h' });
  return { userId, username, email, password: DEFAULT_PASSWORD, token };
}

function authedRequest(token, path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
}

test('rejects fetching the profile with no Authorization header', async () => {
  const response = await fetch(`${baseUrl}/api/users/me`);
  assert.equal(response.status, 401);
});

test('returns the current user\'s profile without leaking the password hash', async () => {
  const user = await createTestUser('getme');
  const response = await authedRequest(user.token, '/api/users/me');
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.user.userId, user.userId);
  assert.equal(body.user.username, user.username);
  assert.equal(body.user.email, user.email);
  assert.equal('passwordHash' in body.user, false);
  assert.equal('password_hash' in body.user, false);
});

test('updates the username', async () => {
  const user = await createTestUser('updusername');
  const newUsername = `renamed${uniqueSuffix()}`;

  const response = await authedRequest(user.token, '/api/users/me', {
    method: 'PUT',
    body: JSON.stringify({ username: newUsername }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.user.username, newUsername);
  assert.equal(body.user.email, user.email);
});

test('updates the email', async () => {
  const user = await createTestUser('updemail');
  const newEmail = `updemail.new.${uniqueSuffix()}@example.com`;

  const response = await authedRequest(user.token, '/api/users/me', {
    method: 'PUT',
    body: JSON.stringify({ email: newEmail }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.user.email, newEmail);
});

test('rejects a profile update with no fields', async () => {
  const user = await createTestUser('updnofields');
  const response = await authedRequest(user.token, '/api/users/me', {
    method: 'PUT',
    body: JSON.stringify({}),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /At least one field/);
});

test('rejects a profile update with a malformed email', async () => {
  const user = await createTestUser('updbademail');
  const response = await authedRequest(user.token, '/api/users/me', {
    method: 'PUT',
    body: JSON.stringify({ email: 'not-an-email' }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /valid email/);
});

test('rejects updating to a username already taken by another user', async () => {
  const userA = await createTestUser('takenusernamea');
  const userB = await createTestUser('takenusernameb');

  const response = await authedRequest(userB.token, '/api/users/me', {
    method: 'PUT',
    body: JSON.stringify({ username: userA.username }),
  });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /username is already taken/);
});

test('rejects updating to an email already in use by another user', async () => {
  const userA = await createTestUser('takenemaila');
  const userB = await createTestUser('takenemailb');

  const response = await authedRequest(userB.token, '/api/users/me', {
    method: 'PUT',
    body: JSON.stringify({ email: userA.email }),
  });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.match(body.error, /already exists/);
});

test('changes the password and allows login with the new password', async () => {
  const user = await createTestUser('changepw');
  const newPassword = 'BrandNewPass456';

  const response = await authedRequest(user.token, '/api/users/me/password', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword: user.password, newPassword }),
  });
  assert.equal(response.status, 204);

  const oldLogin = await fetch(`${baseUrl}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: user.email, password: user.password }),
  });
  assert.equal(oldLogin.status, 401);

  const newLogin = await fetch(`${baseUrl}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: user.email, password: newPassword }),
  });
  assert.equal(newLogin.status, 200);
});

test('rejects a password change with an incorrect current password', async () => {
  const user = await createTestUser('changepwwrong');
  const response = await authedRequest(user.token, '/api/users/me/password', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword: 'totallyWrongPassword', newPassword: 'SomethingNew789' }),
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.match(body.error, /incorrect/);
});

test('rejects reusing the current password as the new password', async () => {
  const user = await createTestUser('changepwreuse');
  const response = await authedRequest(user.token, '/api/users/me/password', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword: user.password, newPassword: user.password }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /cannot reuse/);
});

test('rejects a password change with a new password under 8 characters', async () => {
  const user = await createTestUser('changepwshort');
  const response = await authedRequest(user.token, '/api/users/me/password', {
    method: 'PUT',
    body: JSON.stringify({ currentPassword: user.password, newPassword: 'short' }),
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /at least 8 characters/);
});

test('deletes the account with the correct password and cascades related data', async () => {
  const user = await createTestUser('deleteme');

  await authedRequest(user.token, '/api/categories', {
    method: 'POST',
    body: JSON.stringify({ name: 'Cascade Check' }),
  });

  const response = await authedRequest(user.token, '/api/users/me', {
    method: 'DELETE',
    body: JSON.stringify({ password: user.password }),
  });
  assert.equal(response.status, 204);

  const connection = await getPool().getConnection();
  try {
    const usersResult = await connection.execute('SELECT COUNT(*) c FROM users WHERE user_id = :userId', {
      userId: user.userId,
    });
    const categoriesResult = await connection.execute(
      'SELECT COUNT(*) c FROM categories WHERE user_id = :userId',
      { userId: user.userId }
    );
    assert.equal(usersResult.rows[0].C, 0);
    assert.equal(categoriesResult.rows[0].C, 0);
  } finally {
    await connection.close();
  }
});

test('rejects account deletion with an incorrect password, leaving the account intact', async () => {
  const user = await createTestUser('deletewrong');

  const response = await authedRequest(user.token, '/api/users/me', {
    method: 'DELETE',
    body: JSON.stringify({ password: 'notTheRealPassword' }),
  });
  assert.equal(response.status, 401);

  const getResponse = await authedRequest(user.token, '/api/users/me');
  assert.equal(getResponse.status, 200);
});

test('rejects account deletion with no Authorization header', async () => {
  const response = await fetch(`${baseUrl}/api/users/me`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: DEFAULT_PASSWORD }),
  });
  assert.equal(response.status, 401);
});
