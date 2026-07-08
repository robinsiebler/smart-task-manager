const { getPool } = require('../config/db');

async function getSummary(userId) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      `SELECT
         COUNT(*) AS total_count,
         NVL(SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END), 0) AS completed_count,
         NVL(SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending_count,
         NVL(SUM(CASE WHEN due_date < TRUNC(SYS_EXTRACT_UTC(SYSTIMESTAMP)) AND status != 'Completed' THEN 1 ELSE 0 END), 0) AS overdue_count
       FROM tasks
       WHERE user_id = :userId`,
      { userId }
    );
    return result.rows[0];
  } finally {
    await connection.close();
  }
}

async function getBreakdowns(userId) {
  const connection = await getPool().getConnection();
  try {
    const result = await connection.execute(
      `SELECT
         GROUPING(t.priority) AS is_category_row,
         c.name AS category_name,
         t.priority AS priority,
         COUNT(*) AS task_count
       FROM tasks t
       LEFT JOIN categories c ON c.category_id = t.category_id
       WHERE t.user_id = :userId
       GROUP BY GROUPING SETS ((c.name), (t.priority))`,
      { userId }
    );
    return result.rows;
  } finally {
    await connection.close();
  }
}

module.exports = { getSummary, getBreakdowns };
