const dashboardModel = require('../models/dashboard.model');

function splitBreakdowns(rows) {
  const byCategory = [];
  const byPriority = [];

  for (const row of rows) {
    if (row.IS_CATEGORY_ROW === 1) {
      byCategory.push({ category: row.CATEGORY_NAME ?? 'Uncategorized', count: row.TASK_COUNT });
    } else {
      byPriority.push({ priority: row.PRIORITY, count: row.TASK_COUNT });
    }
  }

  return { byCategory, byPriority };
}

async function getDashboard(userId) {
  const [summary, breakdownRows] = await Promise.all([
    dashboardModel.getSummary(userId),
    dashboardModel.getBreakdowns(userId),
  ]);

  const { byCategory, byPriority } = splitBreakdowns(breakdownRows);

  return {
    total: summary.TOTAL_COUNT,
    completed: summary.COMPLETED_COUNT,
    pending: summary.PENDING_COUNT,
    overdue: summary.OVERDUE_COUNT,
    byCategory,
    byPriority,
  };
}

module.exports = { getDashboard };
