const { test, expect } = require('@playwright/test');
const { deleteUser } = require('../helpers/db');
const { registerUser, loginForToken, createCategory, createTask } = require('../helpers/api');
const { loginAs } = require('../helpers/ui');

let createdUserIds;

test.beforeEach(() => {
  createdUserIds = [];
});

test.afterEach(async () => {
  for (const userId of createdUserIds) {
    await deleteUser(userId);
  }
});

test('shows correct stat counts and breakdowns for a mix of tasks', async ({ page, request }) => {
  const user = await registerUser(request, 'e2edashboard');
  createdUserIds.push(user.userId);
  const token = await loginForToken(request, user.email, user.password);
  const work = await createCategory(request, token, 'Work');

  await createTask(request, token, { title: 'Completed task', status: 'Completed', priority: 'High' });
  await createTask(request, token, { title: 'Pending task', status: 'Pending', priority: 'Medium' });
  await createTask(request, token, {
    title: 'Overdue task',
    status: 'Pending',
    priority: 'Low',
    dueDate: '2020-01-01',
    categoryIds: [work.categoryId],
  });

  await loginAs(page, user.email, user.password, '/index.html');

  await expect(page.locator('#stat-total')).toHaveText('3');
  await expect(page.locator('#stat-completed')).toHaveText('1');
  await expect(page.locator('#stat-pending')).toHaveText('2');
  await expect(page.locator('#stat-overdue')).toHaveText('1');

  await expect(page.locator('#priority-legend')).toContainText('High');
  await expect(page.locator('#priority-legend')).toContainText('Medium');
  await expect(page.locator('#priority-legend')).toContainText('Low');
  await expect(page.locator('#category-bars')).toContainText('Work');
});

test('shows a zeroed dashboard for a user with no tasks', async ({ page, request }) => {
  const user = await registerUser(request, 'e2edashboardempty');
  createdUserIds.push(user.userId);

  await loginAs(page, user.email, user.password, '/index.html');

  await expect(page.locator('#stat-total')).toHaveText('0');
  await expect(page.locator('#stat-completed')).toHaveText('0');
  await expect(page.locator('#stat-pending')).toHaveText('0');
  await expect(page.locator('#stat-overdue')).toHaveText('0');
});
