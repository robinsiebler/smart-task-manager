const taskService = require('../services/task.service');

async function list(req, res) {
  const tasks = await taskService.listTasks(req.user.userId);
  res.status(200).json({ tasks });
}

async function getOne(req, res) {
  const task = await taskService.getTask(Number(req.params.id), req.user.userId);
  res.status(200).json({ task });
}

async function create(req, res) {
  const task = await taskService.createTask(req.user.userId, req.body);
  res.status(201).json({ task });
}

async function update(req, res) {
  const task = await taskService.updateTask(Number(req.params.id), req.user.userId, req.body);
  res.status(200).json({ task });
}

async function remove(req, res) {
  await taskService.deleteTask(Number(req.params.id), req.user.userId);
  res.status(204).send();
}

async function complete(req, res) {
  const task = await taskService.completeTask(Number(req.params.id), req.user.userId);
  res.status(200).json({ task });
}

module.exports = { list, getOne, create, update, remove, complete };
