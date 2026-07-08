const { test, expect } = require('@playwright/test');
const { deleteUser } = require('../helpers/db');
const { registerUser, uniqueSuffix, DEFAULT_PASSWORD } = require('../helpers/api');
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

test('registers a new account through the UI and can then log in', async ({ page, request }) => {
  const suffix = uniqueSuffix();
  const username = `e2ereg${suffix}`;
  const email = `e2ereg.${suffix}@example.com`;

  await page.goto('/register.html');
  await page.fill('#register-username', username);
  await page.fill('#register-email', email);
  await page.fill('#register-password', DEFAULT_PASSWORD);
  await page.click('button[type="submit"]');

  await page.waitForURL((url) => url.pathname === '/login.html', { timeout: 5000 });

  await loginAs(page, email, DEFAULT_PASSWORD);
  await expect(page.locator('h1')).toHaveText('My Tasks');

  const userRes = await request.get('/api/users/me', {
    headers: { Authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('authToken'))}` },
  });
  const userBody = await userRes.json();
  createdUserIds.push(userBody.user.userId);
});

test('shows an error and stays on the login page for a wrong password', async ({ page, request }) => {
  const user = await registerUser(request, 'e2ewrongpw');
  createdUserIds.push(user.userId);

  await page.goto('/login.html');
  await page.fill('#login-identifier', user.email);
  await page.fill('#login-password', 'definitelyWrongPassword');
  await page.click('button[type="submit"]');

  const status = page.locator('#status-message');
  await expect(status).toBeVisible();
  await expect(status).toHaveClass(/status-message--error/);
  expect(new URL(page.url()).pathname).toBe('/login.html');
});

test('logs out and redirects to login; a protected page redirects back when unauthenticated', async ({
  page,
  request,
}) => {
  const user = await registerUser(request, 'e2elogout');
  createdUserIds.push(user.userId);

  await loginAs(page, user.email, user.password);
  await page.click('#logout-btn');
  await page.waitForURL((url) => url.pathname === '/login.html');

  await page.goto('/tasks.html');
  await page.waitForURL((url) => url.pathname === '/login.html');
  expect(new URL(page.url()).searchParams.get('redirect')).toBe('/tasks.html');
});
