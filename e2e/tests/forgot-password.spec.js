const { test, expect } = require('@playwright/test');
const { deleteUser } = require('../helpers/db');
const { registerUser } = require('../helpers/api');
const { requestResetToken } = require('../helpers/passwordReset');

let createdUserIds;

test.beforeEach(() => {
  createdUserIds = [];
});

test.afterEach(async () => {
  for (const userId of createdUserIds) {
    await deleteUser(userId);
  }
});

test('rejects an invalid email on the forgot-password form without hitting the API', async ({ page }) => {
  await page.goto('/forgot-password.html');
  await page.fill('#forgot-email', 'not-an-email');
  await page.click('#forgot-form button[type="submit"]');

  await expect(page.locator('#forgot-email-error')).toHaveText(/valid email/);
  await expect(page.locator('#status-message')).toBeHidden();
  await expect(page.locator('#reset-form')).toBeHidden();
});

test('submitting a valid email shows the generic message and reveals the reset form', async ({ page, request }) => {
  const user = await registerUser(request, 'e2eforgot');
  createdUserIds.push(user.userId);

  await page.goto('/forgot-password.html');
  await page.fill('#forgot-email', user.email);
  await page.click('#forgot-form button[type="submit"]');

  await expect(page.locator('#status-message')).toContainText('If an account exists for this email');
  await expect(page.locator('#reset-form')).toBeVisible();
});

test('rejects a reset submission with a missing token or short password', async ({ page, request }) => {
  const user = await registerUser(request, 'e2eresetvalid');
  createdUserIds.push(user.userId);

  await page.goto('/forgot-password.html');
  await page.fill('#forgot-email', user.email);
  await page.click('#forgot-form button[type="submit"]');
  await expect(page.locator('#reset-form')).toBeVisible();

  await page.fill('#reset-new-password', 'short');
  await page.click('#reset-form button[type="submit"]');
  await expect(page.locator('#reset-token-error')).toHaveText(/reset token/);
  await expect(page.locator('#reset-new-password-error')).toHaveText(/at least 8 characters/);
});

test('rejects an incorrect reset token with the generic invalid-token message', async ({ page, request }) => {
  const user = await registerUser(request, 'e2eresetwrong');
  createdUserIds.push(user.userId);

  await page.goto('/forgot-password.html');
  await page.fill('#forgot-email', user.email);
  await page.click('#forgot-form button[type="submit"]');
  await expect(page.locator('#reset-form')).toBeVisible();

  await page.fill('#reset-token', 'not-the-real-token');
  await page.fill('#reset-new-password', 'BrandNewPass456');
  await page.click('#reset-form button[type="submit"]');

  await expect(page.locator('#status-message')).toHaveText(/Invalid or expired/);
});

test('completes the reset flow with a valid token and the new password works for login', async ({
  page,
  request,
}) => {
  const user = await registerUser(request, 'e2eresetvalid2');
  createdUserIds.push(user.userId);

  await page.goto('/forgot-password.html');
  await page.fill('#forgot-email', user.email);
  await page.click('#forgot-form button[type="submit"]');
  await expect(page.locator('#reset-form')).toBeVisible();

  const token = await requestResetToken(user.email);
  expect(token).toBeTruthy();

  const newPassword = 'BrandNewPass456';
  await page.fill('#reset-token', token);
  await page.fill('#reset-new-password', newPassword);
  await page.click('#reset-form button[type="submit"]');

  await expect(page.locator('#status-message')).toHaveText(/Password reset successfully/);
  await page.waitForURL((url) => url.pathname === '/login.html', { timeout: 5000 });

  const oldLogin = await request.post('/api/users/login', {
    data: { identifier: user.email, password: user.password },
  });
  expect(oldLogin.status()).toBe(401);

  const newLogin = await request.post('/api/users/login', {
    data: { identifier: user.email, password: newPassword },
  });
  expect(newLogin.status()).toBe(200);
});
