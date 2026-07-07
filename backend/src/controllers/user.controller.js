const authService = require('../services/auth.service');

async function register(req, res) {
  const { name, email, password } = req.body;
  const user = await authService.register({ name, email, password });
  res.status(201).json({ user });
}

async function login(req, res) {
  const { email, password } = req.body;
  const { token, user } = await authService.login({ email, password });
  res.status(200).json({ token, user });
}

module.exports = { register, login };
