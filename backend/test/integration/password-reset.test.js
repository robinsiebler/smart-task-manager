const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const app = require('../../src/app');
const { initPool, closePool, getPool } = require('../../src/config/db');

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

function uniqueUsername(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function postJson(path, body) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function deleteUserByEmail(email) {
  const connection = await getPool().getConnection();
  try {
    await connection.execute('DELETE FROM users WHERE email = :email', { email });
  } finally {
    await connection.close();
  }
}

async function registerUser(email, password) {
  const username = uniqueUsername('resettest');
  await postJson('/api/users/register', { username, email, password });
}

function spyOnConsoleLog() {
  const original = console.log;
  const calls = [];
  console.log = (...args) => {
    calls.push(args.join(' '));
  };
  return {
    calls,
    restore: () => {
      console.log = original;
    },
  };
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function extractToken(logLine) {
  const match = logLine.match(/Token for [^:]+: ([a-f0-9]+) \(expires/);
  return match ? match[1] : undefined;
}

async function expirePasswordResetToken(token) {
  const tokenHash = hashToken(token);
  const connection = await getPool().getConnection();
  try {
    await connection.execute(
      `UPDATE password_resets
       SET expires_at = SYS_EXTRACT_UTC(SYSTIMESTAMP) - INTERVAL '1' HOUR
       WHERE token_hash = :tokenHash`,
      { tokenHash }
    );
  } finally {
    await connection.close();
  }
}

async function requestResetToken(email) {
  const spy = spyOnConsoleLog();
  await postJson('/api/auth/forgot-password', { email });
  spy.restore();
  const line = spy.calls.find((call) => call.includes('[Password Reset]'));
  return extractToken(line);
}

async function resetToPassword(email, newPassword) {
  const token = await requestResetToken(email);
  return postJson('/api/auth/reset-password', { email, token, newPassword });
}

test('forgot-password for an existing email logs a token and stores it with a ~15 min expiry', async () => {
  const email = uniqueEmail('forgot-exists');
  try {
    await registerUser(email, 'correcthorse123');

    const spy = spyOnConsoleLog();
    const response = await postJson('/api/auth/forgot-password', { email });
    spy.restore();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(body.message, /If an account exists for this email/);

    const logLine = spy.calls.find((call) => call.includes('[Password Reset]'));
    assert.ok(logLine, 'expected a [Password Reset] log line');
    assert.match(logLine, new RegExp(`\\[Password Reset\\] Token for ${email}: [a-f0-9]+ \\(expires in 15 min\\)`));

    const token = extractToken(logLine);
    const tokenHash = hashToken(token);
    const connection = await getPool().getConnection();
    try {
      const result = await connection.execute(
        'SELECT expires_at, used_at FROM password_resets WHERE token_hash = :tokenHash',
        { tokenHash }
      );
      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].USED_AT, null);
      const minutesUntilExpiry = (new Date(result.rows[0].EXPIRES_AT) - new Date()) / 60000;
      assert.ok(minutesUntilExpiry > 14 && minutesUntilExpiry <= 15, `expected ~15 min, got ${minutesUntilExpiry}`);
    } finally {
      await connection.close();
    }
  } finally {
    await deleteUserByEmail(email);
  }
});

test('forgot-password does not log the reset token when NODE_ENV is production', async () => {
  const email = uniqueEmail('forgot-prod');
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    await registerUser(email, 'correcthorse123');

    process.env.NODE_ENV = 'production';
    const spy = spyOnConsoleLog();
    const response = await postJson('/api/auth/forgot-password', { email });
    spy.restore();
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.match(body.message, /If an account exists for this email/);
    assert.equal(
      spy.calls.find((call) => call.includes('[Password Reset]')),
      undefined
    );
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    await deleteUserByEmail(email);
  }
});

test('forgot-password for a nonexistent email returns the same generic message with no console log', async () => {
  const email = uniqueEmail('forgot-nobody');

  const spy = spyOnConsoleLog();
  const response = await postJson('/api/auth/forgot-password', { email });
  spy.restore();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(body.message, /If an account exists for this email/);
  assert.equal(spy.calls.length, 0);
});

test('forgot-password rejects a missing or malformed email with 400', async () => {
  const missing = await postJson('/api/auth/forgot-password', {});
  assert.equal(missing.status, 400);

  const malformed = await postJson('/api/auth/forgot-password', { email: 'not-an-email' });
  assert.equal(malformed.status, 400);
});

test('reset-password with a valid token actually changes the password', async () => {
  const email = uniqueEmail('reset-valid');
  const oldPassword = 'correcthorse123';
  const newPassword = 'newcorrecthorse456';
  try {
    await registerUser(email, oldPassword);
    const token = await requestResetToken(email);

    const response = await postJson('/api/auth/reset-password', { email, token, newPassword });
    assert.equal(response.status, 200);

    const oldLogin = await postJson('/api/users/login', { identifier: email, password: oldPassword });
    assert.equal(oldLogin.status, 401);

    const newLogin = await postJson('/api/users/login', { identifier: email, password: newPassword });
    assert.equal(newLogin.status, 200);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('reset-password with an expired token is rejected', async () => {
  const email = uniqueEmail('reset-expired');
  try {
    await registerUser(email, 'correcthorse123');
    const token = await requestResetToken(email);
    await expirePasswordResetToken(token);

    const response = await postJson('/api/auth/reset-password', {
      email,
      token,
      newPassword: 'somethingnew123',
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /Invalid or expired reset token/);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('reset-password with an already-used token is rejected', async () => {
  const email = uniqueEmail('reset-reused');
  try {
    await registerUser(email, 'correcthorse123');
    const token = await requestResetToken(email);

    const first = await postJson('/api/auth/reset-password', { email, token, newPassword: 'firstnewpass1' });
    assert.equal(first.status, 200);

    const second = await postJson('/api/auth/reset-password', { email, token, newPassword: 'secondnewpass2' });
    const body = await second.json();

    assert.equal(second.status, 400);
    assert.match(body.error, /Invalid or expired reset token/);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('reset-password with a wrong token is rejected', async () => {
  const email = uniqueEmail('reset-wrong');
  try {
    await registerUser(email, 'correcthorse123');
    await requestResetToken(email);

    const response = await postJson('/api/auth/reset-password', {
      email,
      token: 'totally-made-up-token',
      newPassword: 'somethingnew123',
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /Invalid or expired reset token/);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('reset-password for a nonexistent email gives the same generic invalid-token message', async () => {
  const response = await postJson('/api/auth/reset-password', {
    email: uniqueEmail('reset-nobody'),
    token: 'whatever-token',
    newPassword: 'somethingnew123',
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.error, /Invalid or expired reset token/);
});

test('requesting a new reset token invalidates the previous one', async () => {
  const email = uniqueEmail('reset-superseded');
  try {
    await registerUser(email, 'correcthorse123');
    const firstToken = await requestResetToken(email);
    const secondToken = await requestResetToken(email);

    assert.notEqual(firstToken, secondToken);

    const firstAttempt = await postJson('/api/auth/reset-password', {
      email,
      token: firstToken,
      newPassword: 'firstnewpass1',
    });
    assert.equal(firstAttempt.status, 400);

    const secondAttempt = await postJson('/api/auth/reset-password', {
      email,
      token: secondToken,
      newPassword: 'secondnewpass2',
    });
    assert.equal(secondAttempt.status, 200);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('reset-password rejects a missing token, missing newPassword, or short newPassword', async () => {
  const email = uniqueEmail('reset-validate');

  const missingToken = await postJson('/api/auth/reset-password', { email, newPassword: 'somethingnew123' });
  assert.equal(missingToken.status, 400);

  const missingPassword = await postJson('/api/auth/reset-password', { email, token: 'abc123' });
  assert.equal(missingPassword.status, 400);

  const shortPassword = await postJson('/api/auth/reset-password', { email, token: 'abc123', newPassword: 'short' });
  assert.equal(shortPassword.status, 400);
});

test('the raw password is never logged across register, login, forgot-password, and reset-password', async () => {
  const email = uniqueEmail('no-password-logging');
  const oldPassword = 'correcthorse123SECRET';
  const newPassword = 'brandnewpassword456SECRET';
  const username = uniqueUsername('nolog');

  const spy = spyOnConsoleLog();
  try {
    await postJson('/api/users/register', { username, email, password: oldPassword });
    await postJson('/api/users/login', { identifier: email, password: oldPassword });
    await postJson('/api/auth/forgot-password', { email });

    const resetLine = spy.calls.find((call) => call.includes('[Password Reset]'));
    const token = extractToken(resetLine);
    await postJson('/api/auth/reset-password', { email, token, newPassword });

    for (const line of spy.calls) {
      assert.equal(line.includes(oldPassword), false, `log line leaked old password: ${line}`);
      assert.equal(line.includes(newPassword), false, `log line leaked new password: ${line}`);
    }
    assert.ok(
      spy.calls.some((call) => call.includes('[Password Reset] Token for')),
      'expected the reset token itself to still be logged'
    );
  } finally {
    spy.restore();
    await deleteUserByEmail(email);
  }
});

test('rejects resetting to the current password', async () => {
  const email = uniqueEmail('reuse-current');
  const currentPassword = 'currentpass123';
  try {
    await registerUser(email, currentPassword);

    const response = await resetToPassword(email, currentPassword);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error, /cannot reuse any of your last 5 passwords/);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('rejects reusing a password from within the last 5 changes', async () => {
  const email = uniqueEmail('reuse-recent');
  const passwords = ['genpass1AAA', 'genpass2BBB', 'genpass3CCC'];
  try {
    await registerUser(email, passwords[0]);

    for (let i = 1; i < passwords.length; i++) {
      const response = await resetToPassword(email, passwords[i]);
      assert.equal(response.status, 200);
    }

    // history now holds: genpass1AAA (registration), genpass2BBB, genpass3CCC (current) -- all within the last 5
    const reuseFirst = await resetToPassword(email, passwords[0]);
    const reuseFirstBody = await reuseFirst.json();
    assert.equal(reuseFirst.status, 400);
    assert.match(reuseFirstBody.error, /cannot reuse any of your last 5 passwords/);

    const reuseSecond = await resetToPassword(email, passwords[1]);
    const reuseSecondBody = await reuseSecond.json();
    assert.equal(reuseSecond.status, 400);
    assert.match(reuseSecondBody.error, /cannot reuse any of your last 5 passwords/);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('allows reusing a password once it ages out of the last 5', async () => {
  const email = uniqueEmail('reuse-aged-out');
  const originalPassword = 'originalpassGEN0';
  try {
    await registerUser(email, originalPassword);

    // 5 more changes push the original password out of the 5-entry window
    for (let i = 1; i <= 5; i++) {
      const response = await resetToPassword(email, `generatedpassGEN${i}`);
      assert.equal(response.status, 200, `reset #${i} should have succeeded`);
    }

    const reuseOriginal = await resetToPassword(email, originalPassword);
    assert.equal(reuseOriginal.status, 200);

    const loginResponse = await postJson('/api/users/login', { identifier: email, password: originalPassword });
    assert.equal(loginResponse.status, 200);
  } finally {
    await deleteUserByEmail(email);
  }
});

test('prunes password_history to the 5 most recent entries per user', async () => {
  const email = uniqueEmail('history-prune');
  try {
    await registerUser(email, 'startingpassGEN0');

    for (let i = 1; i <= 5; i++) {
      const response = await resetToPassword(email, `generatedpassGEN${i}`);
      assert.equal(response.status, 200);
    }

    const connection = await getPool().getConnection();
    try {
      const userResult = await connection.execute('SELECT user_id FROM users WHERE email = :email', { email });
      const userId = userResult.rows[0].USER_ID;
      const countResult = await connection.execute(
        'SELECT COUNT(*) AS cnt FROM password_history WHERE user_id = :userId',
        { userId }
      );
      assert.equal(countResult.rows[0].CNT, 5);
    } finally {
      await connection.close();
    }
  } finally {
    await deleteUserByEmail(email);
  }
});
