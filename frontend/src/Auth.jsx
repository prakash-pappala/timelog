import { useState, useEffect } from "react";
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
  const [mode, setMode] = useState("login"); // login | signup | forgot | reset
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      setResetToken(token);
      setMode("reset");
    }
  }, []);

  function resetMessages() {
    setError("");
    setInfo("");
  }

  async function handleLoginOrSignup(e) {
    e.preventDefault();
    resetMessages();

    if (!username.trim() || !password) {
      setError("Enter a username and password.");
      return;
    }
    if (mode === "signup") {
      if (!email.trim()) {
        setError("Enter your email.");
        return;
      }
      if (password.length < 6) {
        setError("Password should be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords don't match.");
        return;
      }
    }

    setLoading(true);
    try {
      const result = mode === "login"
        ? await api.login(username.trim(), password)
        : await api.signup(username.trim(), email.trim(), password);

      api.setToken(result.token);
      onAuthenticated(result.username, result.is_admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e) {
    e.preventDefault();
    resetMessages();

    if (!email.trim()) {
      setError("Enter the email on your account.");
      return;
    }

    setLoading(true);
    try {
      const result = await api.forgotPassword(email.trim());
      setInfo(result.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    resetMessages();

    if (password.length < 6) {
      setError("Password should be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword(resetToken, password);
      setInfo("Password updated. You can sign in now.");
      setTimeout(() => {
        window.history.replaceState({}, "", window.location.pathname);
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        resetMessages();
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function switchMode(newMode) {
    setMode(newMode);
    resetMessages();
    setPassword("");
    setConfirmPassword("");
  }

  if (mode === "reset") {
    return (
      <div style={{ maxWidth: 360, margin: "4rem auto 0", fontFamily: "var(--font-sans)" }}>
        <h1 style={{ marginBottom: 4 }}>Set a new password</h1>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: "1.5rem" }}>
          Choose a new password for your account.
        </p>

        <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <PasswordField label="New password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          <PasswordField label="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />

          {error && <p style={{ fontSize: 13, color: "var(--color-text-danger)", margin: 0 }}>{error}</p>}
          {info && <p style={{ fontSize: 13, color: "var(--color-text-success)", margin: 0 }}>{info}</p>}

          <button type="submit" disabled={loading} style={{ fontSize: 14, padding: "10px 0", marginTop: 4 }}>
            {loading ? "Please wait..." : "Update password"}
          </button>
        </form>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <div style={{ maxWidth: 360, margin: "4rem auto 0", fontFamily: "var(--font-sans)" }}>
        <h1 style={{ marginBottom: 4 }}>Reset your password</h1>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: "1.5rem" }}>
          Enter the email on your account and we'll send a reset link.
        </p>

        <form onSubmit={handleForgotPassword} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", fontSize: 14, boxSizing: "border-box" }}
              autoFocus
            />
          </div>

          {error && <p style={{ fontSize: 13, color: "var(--color-text-danger)", margin: 0 }}>{error}</p>}
          {info && <p style={{ fontSize: 13, color: "var(--color-text-success)", margin: 0 }}>{info}</p>}

          <button type="submit" disabled={loading} style={{ fontSize: 14, padding: "10px 0", marginTop: 4 }}>
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>

        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 16, textAlign: "center" }}>
          <button
            type="button"
            onClick={() => switchMode("login")}
            style={{ fontSize: 13, padding: 0, border: "none", background: "none", color: "var(--color-text-info)", textDecoration: "underline" }}
          >
            Back to sign in
          </button>
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 360, margin: "4rem auto 0", fontFamily: "var(--font-sans)" }}>
      <h1 style={{ marginBottom: 4 }}>Time log</h1>
      <p style={{ color: "var(--color-text-secondary)", fontSize: 14, marginBottom: "1.5rem" }}>
        {mode === "login" ? "Sign in to your account" : "Create an account to start tracking"}
      </p>

      <form onSubmit={handleLoginOrSignup} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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

        {mode === "signup" && (
          <div>
            <label style={{ fontSize: 13, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%", fontSize: 14, boxSizing: "border-box" }}
            />
          </div>
        )}

        <PasswordField label="Password" value={password} onChange={(e) => setPassword(e.target.value)} />

        {mode === "signup" && (
          <PasswordField label="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        )}

        {mode === "login" && (
          <button
            type="button"
            onClick={() => switchMode("forgot")}
            style={{ fontSize: 12, padding: 0, border: "none", background: "none", color: "var(--color-text-info)", textDecoration: "underline", alignSelf: "flex-end" }}
          >
            Forgot password?
          </button>
        )}

        {error && <p style={{ fontSize: 13, color: "var(--color-text-danger)", margin: 0 }}>{error}</p>}

        <button type="submit" disabled={loading} style={{ fontSize: 14, padding: "10px 0", marginTop: 4 }}>
          {loading ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 16, textAlign: "center" }}>
        {mode === "login" ? "New here?" : "Already have an account?"}{" "}
        <button
          type="button"
          onClick={() => switchMode(mode === "login" ? "signup" : "login")}
          style={{ fontSize: 13, padding: 0, border: "none", background: "none", color: "var(--color-text-info)", textDecoration: "underline" }}
        >
          {mode === "login" ? "Create an account" : "Sign in instead"}
        </button>
      </p>
    </div>
  );
}
