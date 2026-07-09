const EMAIL_PATTERN = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const MIN_PASSWORD_LENGTH = 8;

function showStatusMessage(message, isError = false) {
  const el = document.getElementById('status-message');
  el.textContent = message;
  el.hidden = false;
  el.classList.toggle('status-message--error', isError);
  setTimeout(() => {
    el.hidden = true;
  }, 4000);
}

function clearErrors(form) {
  form.querySelectorAll('.field-error').forEach((el) => {
    el.textContent = '';
  });
}

async function loadProfile() {
  const { user } = await api.getMe();
  document.getElementById('profile-username').value = user.username;
  document.getElementById('profile-email').value = user.email;
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  const form = event.target;
  clearErrors(form);

  const username = document.getElementById('profile-username').value.trim();
  const email = document.getElementById('profile-email').value.trim();

  let hasError = false;
  if (!username) {
    document.getElementById('profile-username-error').textContent = 'Username is required.';
    hasError = true;
  }
  if (!email || !EMAIL_PATTERN.test(email)) {
    document.getElementById('profile-email-error').textContent = 'Enter a valid email address.';
    hasError = true;
  }
  if (hasError) return;

  try {
    await api.updateProfile({ username, email });
    showStatusMessage('Profile updated.');
  } catch (err) {
    showStatusMessage(err.message, true);
  }
}

async function handlePasswordSubmit(event) {
  event.preventDefault();
  const form = event.target;
  clearErrors(form);

  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;

  let hasError = false;
  if (!currentPassword) {
    document.getElementById('current-password-error').textContent = 'Current password is required.';
    hasError = true;
  }
  if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
    document.getElementById('new-password-error').textContent =
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    hasError = true;
  }
  if (hasError) return;

  try {
    await api.changePassword({ currentPassword, newPassword });
    showStatusMessage('Password changed.');
    form.reset();
  } catch (err) {
    showStatusMessage(err.message, true);
  }
}

async function handleDeleteSubmit(event) {
  event.preventDefault();
  const form = event.target;
  clearErrors(form);

  const password = document.getElementById('delete-password').value;
  if (!password) {
    document.getElementById('delete-password-error').textContent = 'Password is required.';
    return;
  }

  if (!window.confirm('This will permanently delete your account and everything in it. Continue?')) {
    return;
  }

  try {
    await api.deleteAccount(password);
    api.logout();
  } catch (err) {
    showStatusMessage(err.message, true);
  }
}

function wireUpEvents() {
  attachPasswordToggle('current-password', 'current-password-toggle');
  attachPasswordToggle('new-password', 'new-password-toggle');
  attachPasswordToggle('delete-password', 'delete-password-toggle');

  document.getElementById('logout-btn').addEventListener('click', () => api.logout());
  document.getElementById('profile-form').addEventListener('submit', handleProfileSubmit);
  document.getElementById('password-form').addEventListener('submit', handlePasswordSubmit);

  const deleteForm = document.getElementById('delete-form');
  const showDeleteBtn = document.getElementById('show-delete-btn');

  showDeleteBtn.addEventListener('click', () => {
    deleteForm.hidden = false;
    showDeleteBtn.hidden = true;
  });
  document.getElementById('cancel-delete-btn').addEventListener('click', () => {
    deleteForm.hidden = true;
    showDeleteBtn.hidden = false;
    deleteForm.reset();
    clearErrors(deleteForm);
  });
  deleteForm.addEventListener('submit', handleDeleteSubmit);
}

async function init() {
  wireUpEvents();

  if (!api.isAuthenticated()) {
    redirectToLogin();
    return;
  }

  try {
    await loadProfile();
  } catch (err) {
    showStatusMessage(err.message, true);
  }
}

init();
