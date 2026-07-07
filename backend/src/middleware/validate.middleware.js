const HttpError = require('../utils/HttpError');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function validateRegister(req, res, next) {
  const { name, email, password } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new HttpError(400, 'Name is required'));
  }
  if (!email || !EMAIL_PATTERN.test(email)) {
    return next(new HttpError(400, 'A valid email is required'));
  }
  if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return next(new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`));
  }

  next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body;

  if (!email || !EMAIL_PATTERN.test(email)) {
    return next(new HttpError(400, 'A valid email is required'));
  }
  if (!password || typeof password !== 'string') {
    return next(new HttpError(400, 'Password is required'));
  }

  next();
}

module.exports = { validateRegister, validateLogin };
