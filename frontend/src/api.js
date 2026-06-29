const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";

function getToken() {
  return window.localStorage.getItem("token");
}

function setToken(token) {
  window.localStorage.setItem("token", token);
}

function clearToken() {
  window.localStorage.removeItem("token");
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers["Authorization"] = "Bearer " + token;

  const res = await fetch(API_BASE + path, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Request failed");
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  signup: (username, email, password) =>
    request("/auth/signup", { method: "POST", body: JSON.stringify({ username, email, password }) }),

  login: (username, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  forgotPassword: (email) =>
    request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),

  resetPassword: (token, newPassword) =>
    request("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, new_password: newPassword }) }),

  changePassword: (currentPassword, newPassword) =>
    request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),

  getCategories: () => request("/categories"),

  createCategory: (name, color) =>
    request("/categories", { method: "POST", body: JSON.stringify({ name, color }) }),

  deleteCategory: (id) => request(`/categories/${id}`, { method: "DELETE" }),

  getSessions: () => request("/sessions"),

  getActiveSession: () => request("/sessions/active"),

  startSession: (categoryId, startMs) =>
    request("/sessions/start", {
      method: "POST",
      body: JSON.stringify({ category_id: categoryId, start_ms: startMs }),
    }),

  endActiveSession: (sessionId, endMs) =>
    request(`/sessions/${sessionId}/end`, {
      method: "POST",
      body: JSON.stringify({ end_ms: endMs }),
    }),

  createSession: (categoryId, startMs, endMs) =>
    request("/sessions", {
      method: "POST",
      body: JSON.stringify({ category_id: categoryId, start_ms: startMs, end_ms: endMs }),
    }),

  updateSession: (sessionId, categoryId, startMs, endMs) =>
    request(`/sessions/${sessionId}`, {
      method: "PUT",
      body: JSON.stringify({ category_id: categoryId, start_ms: startMs, end_ms: endMs }),
    }),

  deleteSession: (id) => request(`/sessions/${id}`, { method: "DELETE" }),

  getAdminStats: () => request("/admin/stats"),
  getAdminUsers: () => request("/admin/users"),

  setToken,
  getToken,
  clearToken,
};

  // Notes
  getNotes: () => request("/notes"),
  createNote: (content, date) => request("/notes", { method: "POST", body: JSON.stringify({ content, date }) }),
  updateNote: (id, content, date) => request(`/notes/${id}`, { method: "PUT", body: JSON.stringify({ content, date }) }),
  deleteNote: (id) => request(`/notes/${id}`, { method: "DELETE" }),

  // Todos
  getTodos: () => request("/todos"),
  createTodo: (text, date) => request("/todos", { method: "POST", body: JSON.stringify({ text, date }) }),
  updateTodo: (id, updates) => request(`/todos/${id}`, { method: "PATCH", body: JSON.stringify(updates) }),
  deleteTodo: (id) => request(`/todos/${id}`, { method: "DELETE" }),
