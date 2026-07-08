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

test('login form rejects blank identifier and blank password without hitting the API', async ({ page }) => {
  await page.goto('/login.html');
  await page.click('button[type="submit"]');

  await expect(page.locator('#login-identifier-error')).toHaveText(/email or username/i);
  await expect(page.locator('#login-password-error')).toHaveText(/password is required/i);
});

test('login password field has a working show/hide toggle', async ({ page }) => {
  await page.goto('/login.html');
  const passwordInput = page.locator('#login-password');
  await expect(passwordInput).toHaveAttribute('type', 'password');

  await page.click('#login-password-toggle');
  await expect(passwordInput).toHaveAttribute('type', 'text');

  await page.click('#login-password-toggle');
  await expect(passwordInput).toHaveAttribute('type', 'password');
});

test('register form rejects a blank username, malformed email, and short password', async ({ page }) => {
  await page.goto('/register.html');
  await page.fill('#register-email', 'not-an-email');
  await page.fill('#register-password', 'short');
  await page.click('button[type="submit"]');

  await expect(page.locator('#register-username-error')).toHaveText(/username is required/i);
  await expect(page.locator('#register-email-error')).toHaveText(/valid email/i);
  await expect(page.locator('#register-password-error')).toHaveText(/at least 8 characters/i);
});

test('task form rejects a missing title, priority, and due date', async ({ page, request }) => {
  const user = await registerUser(request, 'e2evalidatetask');
  createdUserIds.push(user.userId);
  await loginAs(page, user.email, user.password);

  await page.click('#add-task-btn');
  await page.click('#task-form button[type="submit"]');

  await expect(page.locator('#title-error')).toHaveText(/title is required/i);
  await expect(page.locator('#priority-error')).toHaveText(/priority is required/i);
  await expect(page.locator('#due-date-error')).toHaveText(/due date is required/i);
});

test('profile form rejects a blank username and a malformed email', async ({ page, request }) => {
  const user = await registerUser(request, 'e2evalidateprofile');
  createdUserIds.push(user.userId);
  await loginAs(page, user.email, user.password, '/profile.html');

  await page.fill('#profile-username', '');
  await page.fill('#profile-email', 'not-an-email');
  await page.click('#profile-form button[type="submit"]');

  await expect(page.locator('#profile-username-error')).toHaveText(/username is required/i);
  await expect(page.locator('#profile-email-error')).toHaveText(/valid email/i);
});

test('password change form rejects a missing current password and a short new password', async ({
  page,
  request,
}) => {
  const user = await registerUser(request, 'e2evalidatepw');
  createdUserIds.push(user.userId);
  await loginAs(page, user.email, user.password, '/profile.html');

  await page.fill('#new-password', 'short');
  await page.click('#password-form button[type="submit"]');

  await expect(page.locator('#current-password-error')).toHaveText(/current password is required/i);
  await expect(page.locator('#new-password-error')).toHaveText(/at least 8 characters/i);
});

test('delete-account form rejects a blank confirmation password', async ({ page, request }) => {
  const user = await registerUser(request, 'e2evalidatedelete');
  createdUserIds.push(user.userId);
  await loginAs(page, user.email, user.password, '/profile.html');

  await page.click('#show-delete-btn');
  await page.click('#delete-form button[type="submit"]');

  await expect(page.locator('#delete-password-error')).toHaveText(/password is required/i);
});
