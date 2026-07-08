const categoryService = require('../services/category.service');

async function list(req, res) {
  const categories = await categoryService.listCategories(req.user.userId);
  res.status(200).json({ categories });
}

async function create(req, res) {
  const category = await categoryService.createCategory(req.user.userId, req.body.name);
  res.status(201).json({ category });
}

async function rename(req, res) {
  const category = await categoryService.renameCategory(req.user.userId, Number(req.params.id), req.body.name);
  res.status(200).json({ category });
}

async function remove(req, res) {
  await categoryService.deleteCategory(req.user.userId, Number(req.params.id));
  res.status(204).send();
}

module.exports = { list, create, rename, remove };
