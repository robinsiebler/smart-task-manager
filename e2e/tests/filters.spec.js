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

async function setup(request, prefix) {
  const user = await registerUser(request, prefix);
  const token = await loginForToken(request, user.email, user.password);
  return { user, token };
}

test('filters the task list by title search', async ({ page, request }) => {
  const { user, token } = await setup(request, 'e2efiltertitle');
  createdUserIds.push(user.userId);
  await createTask(request, token, { title: 'Buy groceries' });
  await createTask(request, token, { title: 'Write report' });

  await loginAs(page, user.email, user.password);
  await expect(page.locator('.task-card')).toHaveCount(2);

  await page.fill('#filter-title', 'groc');
  await expect(page.locator('.task-card')).toHaveCount(1);
  await expect(page.locator('.task-card')).toContainText('Buy groceries');
});

test('filters the task list by status', async ({ page, request }) => {
  const { user, token } = await setup(request, 'e2efilterstatus');
  createdUserIds.push(user.userId);
  await createTask(request, token, { title: 'Pending task', status: 'Pending' });
  await createTask(request, token, { title: 'In progress task', status: 'In Progress' });

  await loginAs(page, user.email, user.password);
  await page.selectOption('#filter-status', 'In Progress');

  await expect(page.locator('.task-card')).toHaveCount(1);
  await expect(page.locator('.task-card')).toContainText('In progress task');
});

test('filters the task list by priority', async ({ page, request }) => {
  const { user, token } = await setup(request, 'e2efilterpriority');
  createdUserIds.push(user.userId);
  await createTask(request, token, { title: 'High priority task', priority: 'High' });
  await createTask(request, token, { title: 'Low priority task', priority: 'Low' });

  await loginAs(page, user.email, user.password);
  await page.selectOption('#filter-priority', 'High');

  await expect(page.locator('.task-card')).toHaveCount(1);
  await expect(page.locator('.task-card')).toContainText('High priority task');
});

test('filters the task list by category', async ({ page, request }) => {
  const { user, token } = await setup(request, 'e2efiltercategory');
  createdUserIds.push(user.userId);
  const work = await createCategory(request, token, 'Work');
  await createCategory(request, token, 'Personal');
  await createTask(request, token, { title: 'Work task', categoryIds: [work.categoryId] });
  await createTask(request, token, { title: 'Personal task' });

  await loginAs(page, user.email, user.password);
  await page.selectOption('#filter-category', { label: 'Work' });

  await expect(page.locator('.task-card')).toHaveCount(1);
  await expect(page.locator('.task-card')).toContainText('Work task');
});

test('clears all filters and restores the full list', async ({ page, request }) => {
  const { user, token } = await setup(request, 'e2eclearfilters');
  createdUserIds.push(user.userId);
  await createTask(request, token, { title: 'Alpha task', priority: 'High' });
  await createTask(request, token, { title: 'Beta task', priority: 'Low' });

  await loginAs(page, user.email, user.password);
  await page.selectOption('#filter-priority', 'High');
  await expect(page.locator('.task-card')).toHaveCount(1);

  await page.click('#clear-filters-btn');
  await expect(page.locator('.task-card')).toHaveCount(2);
  await expect(page.locator('#filter-priority')).toHaveValue('');
});

test('sorts the task list by title', async ({ page, request }) => {
  const { user, token } = await setup(request, 'e2esort');
  createdUserIds.push(user.userId);
  await createTask(request, token, { title: 'Zebra task' });
  await createTask(request, token, { title: 'Apple task' });

  await loginAs(page, user.email, user.password);
  await page.selectOption('#sort-select', 'title');

  await expect(page.locator('.task-card__title')).toHaveText(['Apple task', 'Zebra task']);
});

test('sorts the task list by priority', async ({ page, request }) => {
  const { user, token } = await setup(request, 'e2esortpriority');
  createdUserIds.push(user.userId);
  await createTask(request, token, { title: 'Low priority task', priority: 'Low' });
  await createTask(request, token, { title: 'High priority task', priority: 'High' });
  await createTask(request, token, { title: 'Medium priority task', priority: 'Medium' });

  await loginAs(page, user.email, user.password);
  await page.selectOption('#sort-select', 'priority');

  await expect(page.locator('.task-card__title')).toHaveText([
    'High priority task',
    'Medium priority task',
    'Low priority task',
  ]);
});

test('sorts the task list by status', async ({ page, request }) => {
  const { user, token } = await setup(request, 'e2esortstatus');
  createdUserIds.push(user.userId);
  await createTask(request, token, { title: 'Completed task', status: 'Completed' });
  await createTask(request, token, { title: 'Pending task', status: 'Pending' });

  await loginAs(page, user.email, user.password);
  await page.selectOption('#sort-select', 'status');

  await expect(page.locator('.task-card__title')).toHaveText(['Pending task', 'Completed task']);
});

test('filters the task list by exact due date', async ({ page, request }) => {
  const { user, token } = await setup(request, 'e2efilterduedate');
  createdUserIds.push(user.userId);
  await createTask(request, token, { title: 'Due in August', dueDate: '2026-08-01' });
  await createTask(request, token, { title: 'Due in September', dueDate: '2026-09-01' });

  await loginAs(page, user.email, user.password);
  await page.fill('#filter-due-date', '2026-08-01');

  await expect(page.locator('.task-card')).toHaveCount(1);
  await expect(page.locator('.task-card')).toContainText('Due in August');
});

test('combines multiple filters with AND logic', async ({ page, request }) => {
  const { user, token } = await setup(request, 'e2efiltercombo');
  createdUserIds.push(user.userId);
  await createTask(request, token, { title: 'Matches both filters', priority: 'High', status: 'Pending' });
  await createTask(request, token, { title: 'Wrong priority', priority: 'Low', status: 'Pending' });
  await createTask(request, token, { title: 'Wrong status', priority: 'High', status: 'Completed' });

  await loginAs(page, user.email, user.password);
  await page.selectOption('#filter-priority', 'High');
  await page.selectOption('#filter-status', 'Pending');

  await expect(page.locator('.task-card')).toHaveCount(1);
  await expect(page.locator('.task-card')).toContainText('Matches both filters');
});
