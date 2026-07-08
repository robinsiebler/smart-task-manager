const authService = require('../services/auth.service');

async function forgotPassword(req, res) {
  const result = await authService.forgotPassword(req.body.email);
  res.status(200).json(result);
}

async function resetPassword(req, res) {
  await authService.resetPassword(req.body);
  res.status(200).json({ message: 'Password has been reset successfully.' });
}

module.exports = { forgotPassword, resetPassword };
