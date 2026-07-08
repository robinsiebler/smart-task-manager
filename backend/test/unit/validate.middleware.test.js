const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
} = require('../../src/middleware/validate.middleware');

function callMiddleware(middleware, body) {
  const req = { body };
  const res = {};
  let calledWith;
  const next = (err) => {
    calledWith = err;
  };
  middleware(req, res, next);
  return calledWith;
}

test('validateRegister passes valid input through with no error', () => {
  const err = callMiddleware(validateRegister, {
    username: 'janedoe',
    email: 'jane@example.com',
    password: 'correcthorse123',
  });
  assert.equal(err, undefined);
});

test('validateRegister rejects a missing username', () => {
  const err = callMiddleware(validateRegister, { email: 'jane@example.com', password: 'correcthorse123' });
  assert.equal(err.status, 400);
  assert.match(err.message, /Username is required/);
});

test('validateRegister rejects a blank username', () => {
  const err = callMiddleware(validateRegister, {
    username: '   ',
    email: 'jane@example.com',
    password: 'correcthorse123',
  });
  assert.equal(err.status, 400);
  assert.match(err.message, /Username is required/);
});

test('validateRegister rejects a malformed email', () => {
  const err = callMiddleware(validateRegister, {
    username: 'jane',
    email: 'not-an-email',
    password: 'correcthorse123',
  });
  assert.equal(err.status, 400);
  assert.match(err.message, /valid email/i);
});

test('validateRegister rejects a missing email', () => {
  const err = callMiddleware(validateRegister, { username: 'jane', password: 'correcthorse123' });
  assert.equal(err.status, 400);
  assert.match(err.message, /valid email/i);
});

test('validateRegister rejects a password under 8 characters', () => {
  const err = callMiddleware(validateRegister, { username: 'jane', email: 'jane@example.com', password: 'abc123' });
  assert.equal(err.status, 400);
  assert.match(err.message, /at least 8 characters/);
});

test('validateRegister accepts an 8-character password exactly', () => {
  const err = callMiddleware(validateRegister, {
    username: 'jane',
    email: 'jane@example.com',
    password: 'abcd1234',
  });
  assert.equal(err, undefined);
});

test('validateLogin passes a valid email identifier through with no error', () => {
  const err = callMiddleware(validateLogin, { identifier: 'jane@example.com', password: 'anything' });
  assert.equal(err, undefined);
});

test('validateLogin passes a valid username identifier through with no error', () => {
  const err = callMiddleware(validateLogin, { identifier: 'janedoe', password: 'anything' });
  assert.equal(err, undefined);
});

test('validateLogin rejects a missing identifier', () => {
  const err = callMiddleware(validateLogin, { password: 'anything' });
  assert.equal(err.status, 400);
  assert.match(err.message, /Email or username is required/);
});

test('validateLogin rejects a blank identifier', () => {
  const err = callMiddleware(validateLogin, { identifier: '   ', password: 'anything' });
  assert.equal(err.status, 400);
  assert.match(err.message, /Email or username is required/);
});

test('validateLogin rejects a missing password', () => {
  const err = callMiddleware(validateLogin, { identifier: 'jane@example.com' });
  assert.equal(err.status, 400);
  assert.match(err.message, /Password is required/);
});

test('validateForgotPassword passes a valid email through with no error', () => {
  const err = callMiddleware(validateForgotPassword, { email: 'jane@example.com' });
  assert.equal(err, undefined);
});

test('validateForgotPassword rejects a malformed email', () => {
  const err = callMiddleware(validateForgotPassword, { email: 'not-an-email' });
  assert.equal(err.status, 400);
  assert.match(err.message, /valid email/i);
});

test('validateForgotPassword rejects a missing email', () => {
  const err = callMiddleware(validateForgotPassword, {});
  assert.equal(err.status, 400);
  assert.match(err.message, /valid email/i);
});

test('validateResetPassword passes valid input through with no error', () => {
  const err = callMiddleware(validateResetPassword, {
    email: 'jane@example.com',
    token: 'abc123token',
    newPassword: 'correcthorse123',
  });
  assert.equal(err, undefined);
});

test('validateResetPassword rejects a malformed email', () => {
  const err = callMiddleware(validateResetPassword, {
    email: 'not-an-email',
    token: 'abc123token',
    newPassword: 'correcthorse123',
  });
  assert.equal(err.status, 400);
  assert.match(err.message, /valid email/i);
});

test('validateResetPassword rejects a missing token', () => {
  const err = callMiddleware(validateResetPassword, {
    email: 'jane@example.com',
    newPassword: 'correcthorse123',
  });
  assert.equal(err.status, 400);
  assert.match(err.message, /reset token is required/);
});

test('validateResetPassword rejects a blank token', () => {
  const err = callMiddleware(validateResetPassword, {
    email: 'jane@example.com',
    token: '   ',
    newPassword: 'correcthorse123',
  });
  assert.equal(err.status, 400);
  assert.match(err.message, /reset token is required/);
});

test('validateResetPassword rejects a new password under 8 characters', () => {
  const err = callMiddleware(validateResetPassword, {
    email: 'jane@example.com',
    token: 'abc123token',
    newPassword: 'short',
  });
  assert.equal(err.status, 400);
  assert.match(err.message, /at least 8 characters/);
});
