const authService = require('../services/auth.service');
const profileService = require('../services/profile.service');

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

async function getMe(req, res) {
  const user = await profileService.getProfile(req.user.userId);
  res.status(200).json({ user });
}

async function updateMe(req, res) {
  const { username, email } = req.body;
  const user = await profileService.updateProfile(req.user.userId, { username, email });
  res.status(200).json({ user });
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  await profileService.changePassword(req.user.userId, { currentPassword, newPassword });
  res.status(204).send();
}

async function deleteMe(req, res) {
  await profileService.deleteAccount(req.user.userId, req.body.password);
  res.status(204).send();
}

module.exports = { register, login, getMe, updateMe, changePassword, deleteMe };
