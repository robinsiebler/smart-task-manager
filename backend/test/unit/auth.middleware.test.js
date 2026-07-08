const { test } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../../src/middleware/auth.middleware');
const config = require('../../src/config/env');

function callMiddleware(headers) {
  const req = { headers };
  const res = {};
  let calledWith;
  const next = (err) => {
    calledWith = err;
  };
  authMiddleware(req, res, next);
  return { req, err: calledWith };
}

test('accepts a valid token and attaches req.user', () => {
  const token = jwt.sign({ sub: 42, email: 'jane@example.com' }, config.jwtSecret, { expiresIn: '1h' });
  const { req, err } = callMiddleware({ authorization: `Bearer ${token}` });

  assert.equal(err, undefined);
  assert.deepEqual(req.user, { userId: 42, email: 'jane@example.com' });
});

test('rejects a missing Authorization header', () => {
  const { err } = callMiddleware({});
  assert.equal(err.status, 401);
  assert.match(err.message, /Missing or malformed/);
});

test('rejects a header without the Bearer prefix', () => {
  const token = jwt.sign({ sub: 1, email: 'a@example.com' }, config.jwtSecret);
  const { err } = callMiddleware({ authorization: token });
  assert.equal(err.status, 401);
  assert.match(err.message, /Missing or malformed/);
});

test('rejects a token signed with the wrong secret', () => {
  const token = jwt.sign({ sub: 1, email: 'a@example.com' }, 'wrong-secret', { expiresIn: '1h' });
  const { err } = callMiddleware({ authorization: `Bearer ${token}` });
  assert.equal(err.status, 401);
  assert.match(err.message, /Invalid or expired token/);
});

test('rejects an expired token', () => {
  const token = jwt.sign({ sub: 1, email: 'a@example.com' }, config.jwtSecret, { expiresIn: -10 });
  const { err } = callMiddleware({ authorization: `Bearer ${token}` });
  assert.equal(err.status, 401);
  assert.match(err.message, /Invalid or expired token/);
});

test('rejects a malformed token string', () => {
  const { err } = callMiddleware({ authorization: 'Bearer not-a-real-token' });
  assert.equal(err.status, 401);
  assert.match(err.message, /Invalid or expired token/);
});
