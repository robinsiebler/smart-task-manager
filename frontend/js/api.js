const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('authToken');
}

async function apiRequest(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const message = (body && body.error) || `Request failed with status ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return body;
}

const api = {
  isAuthenticated: () => Boolean(getToken()),
  logout: () => {
    localStorage.removeItem('authToken');
    window.location.href = '/login.html';
  },
  login: (data) => apiRequest('/users/login', { method: 'POST', body: JSON.stringify(data) }),
  register: (data) => apiRequest('/users/register', { method: 'POST', body: JSON.stringify(data) }),
  forgotPassword: (email) =>
    apiRequest('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (data) => apiRequest('/auth/reset-password', { method: 'POST', body: JSON.stringify(data) }),
  getTasks: (query = '') => apiRequest(`/tasks${query}`),
  getTask: (id) => apiRequest(`/tasks/${id}`),
  createTask: (data) => apiRequest('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) => apiRequest(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: (id) => apiRequest(`/tasks/${id}`, { method: 'DELETE' }),
  completeTask: (id) => apiRequest(`/tasks/${id}/complete`, { method: 'PATCH' }),
  getCategories: () => apiRequest('/categories'),
  createCategory: (name) => apiRequest('/categories', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteCategory: (id) => apiRequest(`/categories/${id}`, { method: 'DELETE' }),
  getDashboard: () => apiRequest('/dashboard'),
};
