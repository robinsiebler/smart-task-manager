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

test('adds a new category inline from the task form', async ({ page, request }) => {
  const user = await registerUser(request, 'e2ecatadd');
  createdUserIds.push(user.userId);
  await loginAs(page, user.email, user.password);

  await page.click('#add-task-btn');
  await page.click('#new-category-btn');
  await page.fill('#new-category-name', 'Groceries');
  await page.click('#save-category-btn');

  await expect(page.locator('#task-categories label', { hasText: 'Groceries' })).toBeVisible();
  await expect(page.locator('#task-categories input[type=checkbox]')).toBeChecked();
});

test('renames a category and the change is reflected on a task badge', async ({ page, request }) => {
  const user = await registerUser(request, 'e2ecatrename');
  createdUserIds.push(user.userId);
  const token = await loginForToken(request, user.email, user.password);
  const category = await createCategory(request, token, 'Old Name');
  await createTask(request, token, { title: 'Renamed category task', categoryIds: [category.categoryId] });

  await loginAs(page, user.email, user.password);
  page.once('dialog', (dialog) => dialog.accept('New Name'));

  const card = page.locator('.task-card', { hasText: 'Renamed category task' });
  await card.locator('button:has-text("Edit")').click();
  await page.click('.category-rename-btn');

  await expect(page.locator('#task-categories label', { hasText: 'New Name' })).toBeVisible();
  await page.click('#cancel-form-btn');
  await expect(card.locator('.badge--category')).toHaveText('New Name');
});

test('deletes a category and it is removed from the checkbox list and any task badges', async ({
  page,
  request,
}) => {
  page.on('dialog', (dialog) => dialog.accept());
  const user = await registerUser(request, 'e2ecatdelete');
  createdUserIds.push(user.userId);
  const token = await loginForToken(request, user.email, user.password);
  const category = await createCategory(request, token, 'Temporary');
  await createTask(request, token, { title: 'Category deletion task', categoryIds: [category.categoryId] });

  await loginAs(page, user.email, user.password);

  const card = page.locator('.task-card', { hasText: 'Category deletion task' });
  await card.locator('button:has-text("Edit")').click();
  await expect(page.locator('#task-categories label', { hasText: 'Temporary' })).toBeVisible();
  await page.click('.category-delete-btn');
  await expect(page.locator('#task-categories label')).toHaveCount(0);

  await page.click('#cancel-form-btn');
  await expect(card.locator('.badge--category')).toHaveCount(0);
});
