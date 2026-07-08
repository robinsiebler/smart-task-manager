async function loginAs(page, identifier, password, redirectPath = '/tasks.html') {
  await page.goto(`/login.html?redirect=${encodeURIComponent(redirectPath)}`);
  await page.fill('#login-identifier', identifier);
  await page.fill('#login-password', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => url.pathname === redirectPath);
}

module.exports = { loginAs };
