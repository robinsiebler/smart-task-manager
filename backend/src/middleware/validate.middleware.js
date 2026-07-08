const HttpError = require('../utils/HttpError');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function validateRegister(req, res, next) {
  const { name, email, password } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new HttpError(400, 'Name is required'));
  }
  if (!email || !EMAIL_PATTERN.test(email)) {
    return next(new HttpError(400, 'A valid email is required'));
  }
  if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return next(new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`));
  }

  next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body;

  if (!email || !EMAIL_PATTERN.test(email)) {
    return next(new HttpError(400, 'A valid email is required'));
  }
  if (!password || typeof password !== 'string') {
    return next(new HttpError(400, 'Password is required'));
  }

  next();
}

const PRIORITY_VALUES = ['High', 'Medium', 'Low'];
const STATUS_VALUES = ['Pending', 'In Progress', 'Completed', 'Cancelled'];

function isValidDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function validateCreateTask(req, res, next) {
  const { title, priority, status, dueDate, categoryId } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return next(new HttpError(400, 'Title is required'));
  }
  if (!priority || !PRIORITY_VALUES.includes(priority)) {
    return next(new HttpError(400, `Priority must be one of: ${PRIORITY_VALUES.join(', ')}`));
  }
  if (status !== undefined && !STATUS_VALUES.includes(status)) {
    return next(new HttpError(400, `Status must be one of: ${STATUS_VALUES.join(', ')}`));
  }
  if (!dueDate || !isValidDate(dueDate)) {
    return next(new HttpError(400, 'A valid dueDate is required'));
  }
  if (categoryId !== undefined && categoryId !== null && typeof categoryId !== 'number') {
    return next(new HttpError(400, 'categoryId must be a number or null'));
  }

  next();
}

function validateUpdateTask(req, res, next) {
  const { title, description, priority, status, dueDate, categoryId } = req.body;
  const hasAnyField = [title, description, categoryId, priority, status, dueDate].some((v) => v !== undefined);

  if (!hasAnyField) {
    return next(new HttpError(400, 'At least one field must be provided'));
  }
  if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
    return next(new HttpError(400, 'Title must be a non-empty string'));
  }
  if (priority !== undefined && !PRIORITY_VALUES.includes(priority)) {
    return next(new HttpError(400, `Priority must be one of: ${PRIORITY_VALUES.join(', ')}`));
  }
  if (status !== undefined && !STATUS_VALUES.includes(status)) {
    return next(new HttpError(400, `Status must be one of: ${STATUS_VALUES.join(', ')}`));
  }
  if (dueDate !== undefined && !isValidDate(dueDate)) {
    return next(new HttpError(400, 'dueDate must be a valid date'));
  }
  if (categoryId !== undefined && categoryId !== null && typeof categoryId !== 'number') {
    return next(new HttpError(400, 'categoryId must be a number or null'));
  }

  next();
}

function validateTaskIdParam(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return next(new HttpError(400, 'Invalid task id'));
  }
  next();
}

function validateTaskFilters(req, res, next) {
  const { status, priority, categoryId, dueDate } = req.query;

  if (status !== undefined && !STATUS_VALUES.includes(status)) {
    return next(new HttpError(400, `status must be one of: ${STATUS_VALUES.join(', ')}`));
  }
  if (priority !== undefined && !PRIORITY_VALUES.includes(priority)) {
    return next(new HttpError(400, `priority must be one of: ${PRIORITY_VALUES.join(', ')}`));
  }
  if (categoryId !== undefined && !/^\d+$/.test(categoryId)) {
    return next(new HttpError(400, 'categoryId must be a positive integer'));
  }
  if (dueDate !== undefined && !isValidDate(dueDate)) {
    return next(new HttpError(400, 'dueDate must be a valid date'));
  }

  next();
}

module.exports = {
  validateRegister,
  validateLogin,
  validateCreateTask,
  validateUpdateTask,
  validateTaskIdParam,
  validateTaskFilters,
};
