const HttpError = require('../utils/HttpError');

const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_USERNAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 255;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 4000;

function validateRegister(req, res, next) {
  const { username, email, password } = req.body;

  if (!username || typeof username !== 'string' || !username.trim()) {
    return next(new HttpError(400, 'Username is required'));
  }
  if (username.trim().length > MAX_USERNAME_LENGTH) {
    return next(new HttpError(400, `Username must be ${MAX_USERNAME_LENGTH} characters or fewer`));
  }
  if (!email || !EMAIL_PATTERN.test(email)) {
    return next(new HttpError(400, 'A valid email is required'));
  }
  if (email.length > MAX_EMAIL_LENGTH) {
    return next(new HttpError(400, `Email must be ${MAX_EMAIL_LENGTH} characters or fewer`));
  }
  if (!password || typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return next(new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`));
  }

  next();
}

function validateLogin(req, res, next) {
  const { identifier, password } = req.body;

  if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
    return next(new HttpError(400, 'Email or username is required'));
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

function isValidCategoryIdsArray(value) {
  return Array.isArray(value) && value.every((id) => Number.isInteger(id) && id > 0);
}

function isValidOptionalDescription(description) {
  if (description === undefined || description === null) return true;
  return typeof description === 'string' && description.trim().length <= MAX_DESCRIPTION_LENGTH;
}

function validateCreateTask(req, res, next) {
  const { title, description, priority, status, dueDate, categoryIds } = req.body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return next(new HttpError(400, 'Title is required'));
  }
  if (title.trim().length > MAX_TITLE_LENGTH) {
    return next(new HttpError(400, `Title must be ${MAX_TITLE_LENGTH} characters or fewer`));
  }
  if (!isValidOptionalDescription(description)) {
    return next(new HttpError(400, `Description must be a string of ${MAX_DESCRIPTION_LENGTH} characters or fewer`));
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
  if (categoryIds !== undefined && !isValidCategoryIdsArray(categoryIds)) {
    return next(new HttpError(400, 'categoryIds must be an array of numbers'));
  }

  next();
}

function validateUpdateTask(req, res, next) {
  const { title, description, priority, status, dueDate, categoryIds } = req.body;
  const hasAnyField = [title, description, categoryIds, priority, status, dueDate].some((v) => v !== undefined);

  if (!hasAnyField) {
    return next(new HttpError(400, 'At least one field must be provided'));
  }
  if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
    return next(new HttpError(400, 'Title must be a non-empty string'));
  }
  if (title !== undefined && title.trim().length > MAX_TITLE_LENGTH) {
    return next(new HttpError(400, `Title must be ${MAX_TITLE_LENGTH} characters or fewer`));
  }
  if (!isValidOptionalDescription(description)) {
    return next(new HttpError(400, `Description must be a string of ${MAX_DESCRIPTION_LENGTH} characters or fewer`));
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
  if (categoryIds !== undefined && !isValidCategoryIdsArray(categoryIds)) {
    return next(new HttpError(400, 'categoryIds must be an array of numbers'));
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

function validateCategoryIdParam(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return next(new HttpError(400, 'Invalid category id'));
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

function validateCreateCategory(req, res, next) {
  const { name } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return next(new HttpError(400, 'Category name is required'));
  }
  if (name.trim().length > 100) {
    return next(new HttpError(400, 'Category name must be 100 characters or fewer'));
  }

  next();
}

function validateForgotPassword(req, res, next) {
  const { email } = req.body;

  if (!email || !EMAIL_PATTERN.test(email)) {
    return next(new HttpError(400, 'A valid email is required'));
  }

  next();
}

function validateResetPassword(req, res, next) {
  const { email, token, newPassword } = req.body;

  if (!email || !EMAIL_PATTERN.test(email)) {
    return next(new HttpError(400, 'A valid email is required'));
  }
  if (!token || typeof token !== 'string' || !token.trim()) {
    return next(new HttpError(400, 'A reset token is required'));
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    return next(new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`));
  }

  next();
}

function validateUpdateProfile(req, res, next) {
  const { username, email } = req.body;
  const hasAnyField = [username, email].some((v) => v !== undefined);

  if (!hasAnyField) {
    return next(new HttpError(400, 'At least one field must be provided'));
  }
  if (username !== undefined && (typeof username !== 'string' || !username.trim())) {
    return next(new HttpError(400, 'Username must be a non-empty string'));
  }
  if (username !== undefined && username.trim().length > MAX_USERNAME_LENGTH) {
    return next(new HttpError(400, `Username must be ${MAX_USERNAME_LENGTH} characters or fewer`));
  }
  if (email !== undefined && !EMAIL_PATTERN.test(email)) {
    return next(new HttpError(400, 'A valid email is required'));
  }
  if (email !== undefined && email.length > MAX_EMAIL_LENGTH) {
    return next(new HttpError(400, `Email must be ${MAX_EMAIL_LENGTH} characters or fewer`));
  }

  next();
}

function validateChangePassword(req, res, next) {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || typeof currentPassword !== 'string') {
    return next(new HttpError(400, 'Current password is required'));
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
    return next(new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`));
  }

  next();
}

function validateDeleteAccount(req, res, next) {
  const { password } = req.body;

  if (!password || typeof password !== 'string') {
    return next(new HttpError(400, 'Password is required'));
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
  validateCreateCategory,
  validateCategoryIdParam,
  validateForgotPassword,
  validateResetPassword,
  validateUpdateProfile,
  validateChangePassword,
  validateDeleteAccount,
};
