const dashboardService = require('../services/dashboard.service');

async function getDashboard(req, res) {
  const dashboard = await dashboardService.getDashboard(req.user.userId);
  res.status(200).json({ dashboard });
}

module.exports = { getDashboard };
