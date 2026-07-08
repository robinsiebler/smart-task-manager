const authService = require('../services/auth.service');

async function register(req, res) {
  const { username, email, password } = req.body;
  const user = await authService.register({ username, email, password });
  res.status(201).json({ user });
}

async function login(req, res) {
  const { identifier, password } = req.body;
  const { token, user } = await authService.login({ identifier, password });
  res.status(200).json({ token, user });
}

module.exports = { register, login };
