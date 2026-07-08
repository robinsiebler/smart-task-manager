const categoryModel = require('../models/category.model');
const HttpError = require('../utils/HttpError');

async function listCategories(userId) {
  return categoryModel.findAllByUser(userId);
}

async function createCategory(userId, name) {
  try {
    return await categoryModel.create({ userId, name: name.trim() });
  } catch (err) {
    if (err.errorNum === 1 || /ORA-00001/.test(err.message)) {
      throw new HttpError(409, 'A category with this name already exists');
    }
    throw err;
  }
}

module.exports = { listCategories, createCategory };
