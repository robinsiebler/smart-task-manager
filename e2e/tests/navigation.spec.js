const { test, expect } = require('@playwright/test');
const { deleteUser } = require('../helpers/db');
const { registerUser } = require('../helpers/api');
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

test('nav links move between tasks, dashboard, and profile pages', async ({ page, request }) => {
  const user = await registerUser(request, 'e2enav');
  createdUserIds.push(user.userId);
  await loginAs(page, user.email, user.password);

  await page.click('.app-nav a:has-text("Profile")');
  await expect(page).toHaveURL(/\/profile\.html$/);

  await page.click('.app-nav a:has-text("Dashboard")');
  await expect(page).toHaveURL(/\/index\.html$/);

  await page.click('.app-nav a:has-text("My Tasks")');
  await expect(page).toHaveURL(/\/tasks\.html$/);
});

test('logout is available and works from the dashboard and profile pages', async ({ page, request }) => {
  const user = await registerUser(request, 'e2enavlogout');
  createdUserIds.push(user.userId);

  await loginAs(page, user.email, user.password, '/index.html');
  await page.click('#logout-btn');
  await page.waitForURL((url) => url.pathname === '/login.html');

  await loginAs(page, user.email, user.password, '/profile.html');
  await page.click('#logout-btn');
  await page.waitForURL((url) => url.pathname === '/login.html');
});
