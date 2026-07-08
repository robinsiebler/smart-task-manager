const { test, expect } = require('@playwright/test');
const { deleteUser } = require('../helpers/db');
const { registerUser, loginForToken, createCategory } = require('../helpers/api');
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

test('creates, edits, completes, and deletes a task', async ({ page, request }) => {
  page.on('dialog', (dialog) => dialog.accept());
  const user = await registerUser(request, 'e2etaskcrud');
  createdUserIds.push(user.userId);
  await loginAs(page, user.email, user.password);

  await page.click('#add-task-btn');
  await page.fill('#task-title', 'Write the e2e suite');
  await page.selectOption('#task-priority', 'High');
  await page.fill('#task-due-date', '2026-08-01');
  await page.click('#task-form button[type="submit"]');

  const card = page.locator('.task-card', { hasText: 'Write the e2e suite' });
  await expect(card).toBeVisible();
  await expect(card.locator('.badge--priority-high')).toBeVisible();

  await card.locator('button:has-text("Edit")').click();
  await page.fill('#task-title', 'Write the e2e suite (edited)');
  await page.click('#task-form button[type="submit"]');
  await expect(page.locator('.task-card', { hasText: 'Write the e2e suite (edited)' })).toBeVisible();

  const editedCard = page.locator('.task-card', { hasText: 'Write the e2e suite (edited)' });
  await editedCard.locator('button:has-text("Mark Complete")').click();
  await expect(editedCard).toHaveClass(/task-card--completed/);
  await expect(editedCard.locator('button:has-text("Edit")')).toHaveCount(0);

  await editedCard.locator('button:has-text("Delete")').click();
  await expect(page.locator('.task-card', { hasText: 'Write the e2e suite (edited)' })).toHaveCount(0);
});

test('creates a task with multiple categories and updates them from the edit form', async ({ page, request }) => {
  const user = await registerUser(request, 'e2emulticat');
  createdUserIds.push(user.userId);
  const token = await loginForToken(request, user.email, user.password);
  await createCategory(request, token, 'Work');
  await createCategory(request, token, 'Urgent');

  await loginAs(page, user.email, user.password);
  await page.click('#add-task-btn');
  await page.fill('#task-title', 'Multi-category task');
  await page.selectOption('#task-priority', 'Medium');
  await page.fill('#task-due-date', '2026-08-01');

  const checkboxes = page.locator('#task-categories input[type=checkbox]');
  await checkboxes.nth(0).check();
  await checkboxes.nth(1).check();
  await page.click('#task-form button[type="submit"]');

  const card = page.locator('.task-card', { hasText: 'Multi-category task' });
  await expect(card.locator('.badge--category')).toHaveCount(2);

  await card.locator('button:has-text("Edit")').click();
  await page.locator('#task-categories input[type=checkbox]').nth(0).uncheck();
  await page.click('#task-form button[type="submit"]');

  await expect(card.locator('.badge--category')).toHaveCount(1);
});
