const { test, expect } = require('@playwright/test');
const { deleteUser } = require('../helpers/db');
const { registerUser, uniqueSuffix } = require('../helpers/api');
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

test('shows the current username and email', async ({ page, request }) => {
  const user = await registerUser(request, 'e2eprofileview');
  createdUserIds.push(user.userId);
  await loginAs(page, user.email, user.password, '/profile.html');

  await expect(page.locator('#profile-username')).toHaveValue(user.username);
  await expect(page.locator('#profile-email')).toHaveValue(user.email);
});

test('updates the username and email and it persists after reload', async ({ page, request }) => {
  const user = await registerUser(request, 'e2eprofileupdate');
  createdUserIds.push(user.userId);
  await loginAs(page, user.email, user.password, '/profile.html');

  const suffix = uniqueSuffix();
  const newUsername = `renamed${suffix}`;
  const newEmail = `renamed.${suffix}@example.com`;

  await page.fill('#profile-username', newUsername);
  await page.fill('#profile-email', newEmail);
  await page.click('#profile-form button[type="submit"]');
  await expect(page.locator('#status-message')).toHaveText('Profile updated.');

  await page.reload();
  await expect(page.locator('#profile-username')).toHaveValue(newUsername);
  await expect(page.locator('#profile-email')).toHaveValue(newEmail);
});

test('changes the password so the old one no longer logs in and the new one does', async ({ page, request }) => {
  const user = await registerUser(request, 'e2eprofilepw');
  createdUserIds.push(user.userId);
  await loginAs(page, user.email, user.password, '/profile.html');

  const newPassword = 'BrandNewPass456';
  await page.fill('#current-password', user.password);
  await page.fill('#new-password', newPassword);
  await page.click('#password-form button[type="submit"]');
  await expect(page.locator('#status-message')).toHaveText('Password changed.');

  const oldLogin = await request.post('/api/users/login', {
    data: { identifier: user.email, password: user.password },
  });
  expect(oldLogin.status()).toBe(401);

  const newLogin = await request.post('/api/users/login', {
    data: { identifier: user.email, password: newPassword },
  });
  expect(newLogin.status()).toBe(200);
});

test('deletes the account through the Danger Zone and redirects to login', async ({ page, request }) => {
  const user = await registerUser(request, 'e2eprofiledelete');
  // Deliberately not pushed to createdUserIds: the account deletes itself as part of the test.
  await loginAs(page, user.email, user.password, '/profile.html');

  page.on('dialog', (dialog) => dialog.accept());
  await page.click('#show-delete-btn');
  await page.fill('#delete-password', user.password);
  await page.click('#delete-form button[type="submit"]');

  await page.waitForURL((url) => url.pathname === '/login.html');

  const loginRes = await request.post('/api/users/login', {
    data: { identifier: user.email, password: user.password },
  });
  expect(loginRes.status()).toBe(401);
});
