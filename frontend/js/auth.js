const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const MIN_PASSWORD_LENGTH = 8;

function clearFieldErrors(form) {
  form.querySelectorAll('.field-error').forEach((el) => {
    el.textContent = '';
  });
}

function showStatusMessage(message, isError = false) {
  const el = document.getElementById('status-message');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
  el.classList.toggle('status-message--error', isError);
}

function initLoginPage() {
  const form = document.getElementById('login-form');
  if (!form) return;

  attachPasswordToggle('login-password', 'login-password-toggle');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors(form);

    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;

    let hasError = false;
    if (!identifier) {
      document.getElementById('login-identifier-error').textContent = 'Enter your email or username.';
      hasError = true;
    }
    if (!password) {
      document.getElementById('login-password-error').textContent = 'Password is required.';
      hasError = true;
    }
    if (hasError) return;

    try {
      const data = await api.login({ identifier, password });
      localStorage.setItem('authToken', data.token);
      window.location.href = getSafeRedirectTarget();
    } catch (err) {
      showStatusMessage(err.message, true);
    }
  });
}

function initRegisterPage() {
  const form = document.getElementById('register-form');
  if (!form) return;

  attachPasswordToggle('register-password', 'register-password-toggle');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors(form);

    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;

    let hasError = false;
    if (!username) {
      document.getElementById('register-username-error').textContent = 'Username is required.';
      hasError = true;
    }
    if (!email || !EMAIL_PATTERN.test(email)) {
      document.getElementById('register-email-error').textContent = 'Enter a valid email address.';
      hasError = true;
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      document.getElementById('register-password-error').textContent =
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
      hasError = true;
    }
    if (hasError) return;

    try {
      await api.register({ username, email, password });
      showStatusMessage('Account created. You can now log in.');
      setTimeout(() => {
        window.location.href = '/login.html';
      }, 1200);
    } catch (err) {
      showStatusMessage(err.message, true);
    }
  });
}

function initForgotPasswordPage() {
  const forgotForm = document.getElementById('forgot-form');
  if (!forgotForm) return;

  const resetForm = document.getElementById('reset-form');
  attachPasswordToggle('reset-new-password', 'reset-password-toggle');

  let submittedEmail = '';

  forgotForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors(forgotForm);

    const email = document.getElementById('forgot-email').value.trim();
    if (!email || !EMAIL_PATTERN.test(email)) {
      document.getElementById('forgot-email-error').textContent = 'Enter a valid email address.';
      return;
    }

    try {
      const data = await api.forgotPassword(email);
      submittedEmail = email;
      showStatusMessage(data.message);
      resetForm.hidden = false;
    } catch (err) {
      showStatusMessage(err.message, true);
    }
  });

  resetForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearFieldErrors(resetForm);

    const token = document.getElementById('reset-token').value.trim();
    const newPassword = document.getElementById('reset-new-password').value;

    let hasError = false;
    if (!token) {
      document.getElementById('reset-token-error').textContent = 'Enter the reset token from the server console.';
      hasError = true;
    }
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      document.getElementById('reset-new-password-error').textContent =
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
      hasError = true;
    }
    if (hasError) return;

    try {
      await api.resetPassword({ email: submittedEmail, token, newPassword });
      showStatusMessage('Password reset successfully. You can now log in.');
      setTimeout(() => {
        window.location.href = '/login.html';
      }, 1200);
    } catch (err) {
      showStatusMessage(err.message, true);
    }
  });
}

initLoginPage();
initRegisterPage();
initForgotPasswordPage();
