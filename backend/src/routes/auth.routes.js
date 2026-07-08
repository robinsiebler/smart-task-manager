const express = require('express');
const authController = require('../controllers/auth.controller');
const { validateForgotPassword, validateResetPassword } = require('../middleware/validate.middleware');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.post('/forgot-password', validateForgotPassword, asyncHandler(authController.forgotPassword));
router.post('/reset-password', validateResetPassword, asyncHandler(authController.resetPassword));

module.exports = router;
