const categoryService = require('../services/category.service');

async function list(req, res) {
  const categories = await categoryService.listCategories(req.user.userId);
  res.status(200).json({ categories });
}

async function create(req, res) {
  const category = await categoryService.createCategory(req.user.userId, req.body.name);
  res.status(201).json({ category });
}

module.exports = { list, create };
