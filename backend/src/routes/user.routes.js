const express = require('express');
const userController = require('../controllers/user.controller');
const { validateRegister, validateLogin } = require('../middleware/validate.middleware');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.post('/register', validateRegister, asyncHandler(userController.register));
router.post('/login', validateLogin, asyncHandler(userController.login));

module.exports = router;
