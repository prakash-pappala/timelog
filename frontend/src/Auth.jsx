import { useState } from "react";
import { api } from "./api";

export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Enter a username and password.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("Password should be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      const result = mode === "login"
        ? await api.login(username.trim(), password)
        : await api.signup(username.trim(), password);

      api.setToken(result.token);
      onAuthenticated(result.username, result.is_admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "4rem auto 0", fontFamily: "var(--font-sans)" }}>
      <h1 style={{ marginBottom: 4 }}>Time log</h1>
      <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: "1.5rem" }}>
        {mode === "login" ? "Sign in to your account" : "Create an account to start tracking"}
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>
            Username
          </label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ width: "100%", fontSize: 14 }}
            autoFocus
          />
        </div>
        <div>
          <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", fontSize: 14 }}
          />
        </div>

        {error && (
          <p style={{ fontSize: 13, color: "var(--color-text-danger)", margin: 0 }}>{error}</p>
        )}

        <button type="submit" disabled={loading} style={{ fontSize: 14, padding: "10px 0", marginTop: 4 }}>
          {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 16, textAlign: "center" }}>
        {mode === "login" ? "New here?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError("");
          }}
          style={{ fontSize: 13, padding: 0, border: "none", background: "none", color: "var(--color-text-info)", textDecoration: "underline" }}
        >
          {mode === "login" ? "Create an account" : "Sign in instead"}
        </button>
      </p>
    </div>
  );
}
