const express = require('express');
const taskController = require('../controllers/task.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { validateCreateTask, validateUpdateTask, validateTaskIdParam } = require('../middleware/validate.middleware');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.use(authMiddleware);

router.get('/', asyncHandler(taskController.list));
router.get('/:id', validateTaskIdParam, asyncHandler(taskController.getOne));
router.post('/', validateCreateTask, asyncHandler(taskController.create));
router.put('/:id', validateTaskIdParam, validateUpdateTask, asyncHandler(taskController.update));
router.delete('/:id', validateTaskIdParam, asyncHandler(taskController.remove));
router.patch('/:id/complete', validateTaskIdParam, asyncHandler(taskController.complete));

module.exports = router;
