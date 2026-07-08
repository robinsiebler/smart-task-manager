const taskModel = require('../models/task.model');
const HttpError = require('../utils/HttpError');

const DEFAULT_STATUS = 'Pending';

function dedupe(ids) {
  return [...new Set(ids)];
}

async function assertCategoryOwnership(categoryIds, userId) {
  const uniqueIds = dedupe(categoryIds);
  if (uniqueIds.length === 0) return;
  const ownedCount = await taskModel.countOwnedCategories(uniqueIds, userId);
  if (ownedCount !== uniqueIds.length) {
    throw new HttpError(400, 'Invalid category');
  }
}

async function listTasks(userId, filters = {}) {
  const cleanFilters = {};
  if (filters.title !== undefined && filters.title.trim() !== '') cleanFilters.title = filters.title.trim();
  if (filters.status !== undefined) cleanFilters.status = filters.status;
  if (filters.priority !== undefined) cleanFilters.priority = filters.priority;
  if (filters.categoryId !== undefined && !Number.isNaN(filters.categoryId)) {
    cleanFilters.categoryId = filters.categoryId;
  }
  if (filters.dueDate !== undefined) cleanFilters.dueDate = new Date(filters.dueDate);

  return taskModel.findAllByUser(userId, cleanFilters);
}

async function getTask(taskId, userId) {
  const task = await taskModel.findByIdForUser(taskId, userId);
  if (!task) {
    throw new HttpError(404, 'Task not found');
  }
  return task;
}

async function createTask(userId, { title, description, categoryIds, priority, status, dueDate }) {
  const cleanCategoryIds = dedupe(categoryIds || []);
  await assertCategoryOwnership(cleanCategoryIds, userId);

  return taskModel.create({
    userId,
    title: title.trim(),
    description: description ? description.trim() : null,
    categoryIds: cleanCategoryIds,
    priority,
    status: status || DEFAULT_STATUS,
    dueDate: new Date(dueDate),
  });
}

async function updateTask(taskId, userId, fields) {
  const existing = await taskModel.findByIdForUser(taskId, userId);
  if (!existing) {
    throw new HttpError(404, 'Task not found');
  }
  if (existing.status === 'Completed') {
    throw new HttpError(409, 'Completed tasks cannot be modified');
  }

  let cleanCategoryIds;
  if (fields.categoryIds !== undefined) {
    cleanCategoryIds = dedupe(fields.categoryIds);
    await assertCategoryOwnership(cleanCategoryIds, userId);
  }

  const updateFields = {};
  if (fields.title !== undefined) updateFields.title = fields.title.trim();
  if (fields.description !== undefined) {
    updateFields.description = fields.description ? fields.description.trim() : null;
  }
  if (fields.priority !== undefined) updateFields.priority = fields.priority;
  if (fields.status !== undefined) updateFields.status = fields.status;
  if (fields.dueDate !== undefined) updateFields.dueDate = new Date(fields.dueDate);
  if (cleanCategoryIds !== undefined) updateFields.categoryIds = cleanCategoryIds;

  return taskModel.update(taskId, userId, updateFields);
}

async function deleteTask(taskId, userId) {
  const deleted = await taskModel.remove(taskId, userId);
  if (!deleted) {
    throw new HttpError(404, 'Task not found');
  }
}

async function completeTask(taskId, userId) {
  const existing = await taskModel.findByIdForUser(taskId, userId);
  if (!existing) {
    throw new HttpError(404, 'Task not found');
  }
  if (existing.status === 'Completed') {
    throw new HttpError(409, 'Task is already completed');
  }

  return taskModel.update(taskId, userId, { status: 'Completed' });
}

module.exports = { listTasks, getTask, createTask, updateTask, deleteTask, completeTask };
