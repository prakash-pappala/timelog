const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";

function getToken() {
  return window.sessionStorage.getItem("token");
}

function setToken(token) {
  window.sessionStorage.setItem("token", token);
}

function clearToken() {
  window.sessionStorage.removeItem("token");
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
  signup: (username, password) =>
    request("/auth/signup", { method: "POST", body: JSON.stringify({ username, password }) }),

  login: (username, password) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  getCategories: () => request("/categories"),

  createCategory: (name, color) =>
    request("/categories", { method: "POST", body: JSON.stringify({ name, color }) }),

  deleteCategory: (id) => request(`/categories/${id}`, { method: "DELETE" }),

  getSessions: () => request("/sessions"),

  createSession: (categoryId, startMs, endMs) =>
    request("/sessions", {
      method: "POST",
      body: JSON.stringify({ category_id: categoryId, start_ms: startMs, end_ms: endMs }),
    }),

  deleteSession: (id) => request(`/sessions/${id}`, { method: "DELETE" }),

  setToken,
  getToken,
  clearToken,
};
