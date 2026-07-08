const express = require('express');
const userController = require('../controllers/user.controller');
const authMiddleware = require('../middleware/auth.middleware');
const {
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validateChangePassword,
  validateDeleteAccount,
} = require('../middleware/validate.middleware');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.post('/register', validateRegister, asyncHandler(userController.register));
router.post('/login', validateLogin, asyncHandler(userController.login));
router.get('/me', authMiddleware, asyncHandler(userController.getMe));
router.put('/me', authMiddleware, validateUpdateProfile, asyncHandler(userController.updateMe));
router.put('/me/password', authMiddleware, validateChangePassword, asyncHandler(userController.changePassword));
router.delete('/me', authMiddleware, validateDeleteAccount, asyncHandler(userController.deleteMe));

module.exports = router;
