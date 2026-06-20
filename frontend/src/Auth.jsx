import { useState } from "react";
import { api } from "./api";

function PasswordField({ label, value, onChange, autoFocus }) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoFocus={autoFocus}
          style={{ width: "100%", fontSize: 14, paddingRight: 40, boxSizing: "border-box" }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          style={{
            position: "absolute",
            right: 4,
            top: "50%",
            transform: "translateY(-50%)",
            border: "none",
            background: "none",
            padding: "4px 8px",
            fontSize: 12,
            color: "var(--color-text-secondary)",
            cursor: "pointer",
          }}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

export default function Auth({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords don't match.");
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

  function switchMode() {
    setMode(mode === "login" ? "signup" : "login");
    setError("");
    setPassword("");
    setConfirmPassword("");
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
            style={{ width: "100%", fontSize: 14, boxSizing: "border-box" }}
            autoFocus
          />
        </div>

        <PasswordField
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {mode === "signup" && (
          <PasswordField
            label="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        )}

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
          onClick={switchMode}
          style={{ fontSize: 13, padding: 0, border: "none", background: "none", color: "var(--color-text-info)", textDecoration: "underline" }}
        >
          {mode === "login" ? "Create an account" : "Sign in instead"}
        </button>
      </p>
    </div>
  );
}
