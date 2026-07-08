const jwt = require('jsonwebtoken');
const config = require('../config/env');
const HttpError = require('../utils/HttpError');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Missing or malformed Authorization header'));
  }

  const token = authHeader.slice('Bearer '.length).trim();

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = { userId: decoded.sub, email: decoded.email };
    next();
  } catch {
    next(new HttpError(401, 'Invalid or expired token'));
  }
}

module.exports = authMiddleware;
