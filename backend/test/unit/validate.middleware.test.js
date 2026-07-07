const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateRegister, validateLogin } = require('../../src/middleware/validate.middleware');

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
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: 'correcthorse123',
  });
  assert.equal(err, undefined);
});

test('validateRegister rejects a missing name', () => {
  const err = callMiddleware(validateRegister, { email: 'jane@example.com', password: 'correcthorse123' });
  assert.equal(err.status, 400);
  assert.match(err.message, /Name is required/);
});

test('validateRegister rejects a blank name', () => {
  const err = callMiddleware(validateRegister, {
    name: '   ',
    email: 'jane@example.com',
    password: 'correcthorse123',
  });
  assert.equal(err.status, 400);
  assert.match(err.message, /Name is required/);
});

test('validateRegister rejects a malformed email', () => {
  const err = callMiddleware(validateRegister, { name: 'Jane', email: 'not-an-email', password: 'correcthorse123' });
  assert.equal(err.status, 400);
  assert.match(err.message, /valid email/i);
});

test('validateRegister rejects a missing email', () => {
  const err = callMiddleware(validateRegister, { name: 'Jane', password: 'correcthorse123' });
  assert.equal(err.status, 400);
  assert.match(err.message, /valid email/i);
});

test('validateRegister rejects a password under 8 characters', () => {
  const err = callMiddleware(validateRegister, { name: 'Jane', email: 'jane@example.com', password: 'abc123' });
  assert.equal(err.status, 400);
  assert.match(err.message, /at least 8 characters/);
});

test('validateRegister accepts an 8-character password exactly', () => {
  const err = callMiddleware(validateRegister, { name: 'Jane', email: 'jane@example.com', password: 'abcd1234' });
  assert.equal(err, undefined);
});

test('validateLogin passes valid input through with no error', () => {
  const err = callMiddleware(validateLogin, { email: 'jane@example.com', password: 'anything' });
  assert.equal(err, undefined);
});

test('validateLogin rejects a malformed email', () => {
  const err = callMiddleware(validateLogin, { email: 'not-an-email', password: 'anything' });
  assert.equal(err.status, 400);
  assert.match(err.message, /valid email/i);
});

test('validateLogin rejects a missing password', () => {
  const err = callMiddleware(validateLogin, { email: 'jane@example.com' });
  assert.equal(err.status, 400);
  assert.match(err.message, /Password is required/);
});
