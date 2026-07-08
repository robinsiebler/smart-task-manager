const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const { initPool, closePool, getPool } = require('../../src/config/db');
const config = require('../../src/config/env');

let server;
let baseUrl;

before(async () => {
  await initPool();
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closePool();
});

function uniqueEmail(prefix) {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2)}@example.com`;
}

async function deleteUserByEmail(email) {
  const connection = await getPool().getConnection();
  try {
    await connection.execute('DELETE FROM users WHERE email = :email', { email });
  } finally {
    await connection.close();
  }
}

function postJson(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('registers a new user and does not return the password hash', async () => {
  const email = uniqueEmail('register');
  try {
    const response = await postJson('/api/users/register', {
      username: 'Test User',
      email,
      password: 'correcthorse123',
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.user.email, email);
    assert.equal('password' in body.user, false);
    assert.equal('passwordHash' in body.user, false);
    assert.equal('password_hash' in body.user, false);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('rejects registering a duplicate email with 409', async () => {
  const email = uniqueEmail('dup-register');
  try {
    await postJson('/api/users/register', { username: 'First', email, password: 'correcthorse123' });

    const response = await postJson('/api/users/register', { username: 'Second', email, password: 'anotherpassword' });
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.match(body.error, /already exists/);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('rejects registering a duplicate username with 409 and a distinct message from duplicate email', async () => {
  const username = `dup-username-${Date.now()}`;
  const emailA = uniqueEmail('dup-username-a');
  const emailB = uniqueEmail('dup-username-b');
  try {
    await postJson('/api/users/register', { username, email: emailA, password: 'correcthorse123' });

    const response = await postJson('/api/users/register', { username, email: emailB, password: 'correcthorse123' });
    const body = await response.json();

    assert.equal(response.status, 409);
    assert.match(body.error, /username is already taken/);
  } finally {
    await deleteUserByEmail(emailA);
    await deleteUserByEmail(emailB);
  }
});

test('rejects registration with a malformed email with 400', async () => {
  const response = await postJson('/api/users/register', {
    username: 'Bad Email',
    email: 'not-an-email',
    password: 'correcthorse123',
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /valid email/i);
});

test('rejects registration with a short password with 400', async () => {
  const response = await postJson('/api/users/register', {
    username: 'Short Pw',
    email: uniqueEmail('shortpw'),
    password: 'abc',
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /at least 8 characters/);
});

test('rejects registration with a username over 100 characters with 400', async () => {
  const response = await postJson('/api/users/register', {
    username: 'x'.repeat(101),
    email: uniqueEmail('longusername'),
    password: 'correcthorse123',
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /100 characters or fewer/);
});

test('rejects registration with an email over 255 characters with 400', async () => {
  const longEmail = `${'x'.repeat(250)}@example.com`;
  const response = await postJson('/api/users/register', {
    username: 'Long Email',
    email: longEmail,
    password: 'correcthorse123',
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /255 characters or fewer/);
});

test('logs in with email as the identifier and returns a verifiable JWT', async () => {
  const email = uniqueEmail('login');
  const password = 'correcthorse123';
  try {
    await postJson('/api/users/register', { username: 'Login User', email, password });

    const response = await postJson('/api/users/login', { identifier: email, password });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.user.email, email);

    const decoded = jwt.verify(body.token, config.jwtSecret);
    assert.equal(decoded.email, email);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('logs in with username as the identifier', async () => {
  const email = uniqueEmail('login-username');
  const username = `login-username-${Date.now()}`;
  const password = 'correcthorse123';
  try {
    await postJson('/api/users/register', { username, email, password });

    const response = await postJson('/api/users/login', { identifier: username, password });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.user.username, username);
    assert.equal(body.user.email, email);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('rejects login with the wrong password with a generic 401', async () => {
  const email = uniqueEmail('wrongpw');
  try {
    await postJson('/api/users/register', { username: 'Wrong Pw', email, password: 'correcthorse123' });

    const response = await postJson('/api/users/login', { identifier: email, password: 'incorrectpassword' });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error, 'Invalid email/username or password');
  } finally {
    await deleteUserByEmail(email);
  }
});

test('rejects login for a nonexistent identifier with the same generic 401 message', async () => {
  const response = await postJson('/api/users/login', {
    identifier: uniqueEmail('nobody'),
    password: 'correcthorse123',
  });
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error, 'Invalid email/username or password');
});

test('stores the password as a bcrypt hash, never plaintext', async () => {
  const email = uniqueEmail('hash-check');
  const password = 'correcthorse123';
  try {
    await postJson('/api/users/register', { username: 'Hash Check', email, password });

    const connection = await getPool().getConnection();
    let storedHash;
    try {
      const result = await connection.execute('SELECT password_hash FROM users WHERE email = :email', { email });
      storedHash = result.rows[0].PASSWORD_HASH;
    } finally {
      await connection.close();
    }

    assert.notEqual(storedHash, password);
    assert.match(storedHash, /^\$2[aby]\$\d{2}\$/);
  } finally {
    await deleteUserByEmail(email);
  }
});
