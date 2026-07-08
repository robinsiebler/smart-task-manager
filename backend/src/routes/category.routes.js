const express = require('express');
const categoryController = require('../controllers/category.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { validateCreateCategory, validateCategoryIdParam } = require('../middleware/validate.middleware');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.use(authMiddleware);

router.get('/', asyncHandler(categoryController.list));
router.post('/', validateCreateCategory, asyncHandler(categoryController.create));
router.delete('/:id', validateCategoryIdParam, asyncHandler(categoryController.remove));

module.exports = router;
