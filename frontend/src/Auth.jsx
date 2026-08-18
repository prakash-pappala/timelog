import { useState, useEffect } from "react";
import { api } from "./api";

const S = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f5f5f5",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: "40px 36px",
    width: "100%",
    maxWidth: 400,
    boxShadow: "0 2px 16px rgba(0,0,0,0.08)",
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    color: "#1877F2",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    textAlign: "center",
    color: "#888",
    fontSize: 14,
    marginBottom: 28,
  },
  tabs: {
    display: "flex",
    borderBottom: "1px solid #eee",
    marginBottom: 24,
  },
  tab: (active) => ({
    flex: 1,
    padding: "10px 0",
    textAlign: "center",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: active ? 700 : 400,
    color: active ? "#1877F2" : "#888",
    borderBottom: active ? "2px solid #1877F2" : "2px solid transparent",
    background: "none",
    border: "none",
    borderBottom: active ? "2px solid #1877F2" : "2px solid transparent",
  }),
  field: {
    marginBottom: 14,
  },
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#444",
    marginBottom: 4,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #ddd",
    borderRadius: 8,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
  },
  btn: {
    width: "100%",
    padding: "12px",
    background: "#1877F2",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 8,
  },
  link: {
    color: "#1877F2",
    cursor: "pointer",
    fontSize: 13,
    textDecoration: "underline",
    background: "none",
    border: "none",
    padding: 0,
  },
  error: { color: "#e00", fontSize: 13, marginBottom: 10 },
  success: { color: "#0a0", fontSize: 13, marginBottom: 10 },
  center: { textAlign: "center", marginTop: 16 },
};

export default function Auth({ onAuthenticated, resetToken }) {
  const [tab, setTab] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  // If resetToken is passed, show reset form directly
  const isReset = !!resetToken;

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.login(username, password);
      api.setToken(res.token);
      onAuthenticated(res.username, res.is_admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.signup(username, email, password);
      api.setToken(res.token);
      onAuthenticated(res.username, res.is_admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.forgotPassword(forgotEmail);
      setSuccess("Password reset link sent to your email.");
      setShowForgot(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(resetToken, newPassword);
      setSuccess("Password reset successfully. Please log in.");
      setTimeout(() => {
        window.location.href = window.location.origin;
      }, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Password reset form
  if (isReset) {
    return (
      <div style={S.wrap}>
        <div style={S.card}>
          <h1 style={S.title}>TimeBook</h1>
          <p style={S.subtitle}>Set your new password</p>
          {error && <p style={S.error}>{error}</p>}
          {success && <p style={S.success}>{success}</p>}
          <form onSubmit={handleReset}>
            <div style={S.field}>
              <label style={S.label}>New Password</label>
              <input
                style={S.input}
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                placeholder="Enter new password"
              />
            </div>
            <div style={S.field}>
              <label style={S.label}>Confirm Password</label>
              <input
                style={S.input}
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                placeholder="Confirm new password"
              />
            </div>
            <button style={S.btn} type="submit" disabled={loading}>
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Forgot password form
  if (showForgot) {
    return (
      <div style={S.wrap}>
        <div style={S.card}>
          <h1 style={S.title}>TimeBook</h1>
          <p style={S.subtitle}>Reset your password</p>
          {error && <p style={S.error}>{error}</p>}
          {success && <p style={S.success}>{success}</p>}
          <form onSubmit={handleForgot}>
            <div style={S.field}>
              <label style={S.label}>Email address</label>
              <input
                style={S.input}
                type="email"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                required
                placeholder="Enter your email"
              />
            </div>
            <button style={S.btn} type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>
          <div style={S.center}>
            <button style={S.link} onClick={() => setShowForgot(false)}>
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Login / Signup
  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <h1 style={S.title}>TimeBook</h1>
        <p style={S.subtitle}>Sign in to your account</p>

        <div style={S.tabs}>
          <button style={S.tab(tab === "login")} onClick={() => { setTab("login"); setError(""); }}>
            Sign in
          </button>
          <button style={S.tab(tab === "signup")} onClick={() => { setTab("signup"); setError(""); }}>
            Create account
          </button>
        </div>

        {error && <p style={S.error}>{error}</p>}
        {success && <p style={S.success}>{success}</p>}

        {tab === "login" ? (
          <form onSubmit={handleLogin}>
            <div style={S.field}>
              <label style={S.label}>Username</label>
              <input
                style={S.input}
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                placeholder="Enter username"
              />
            </div>
            <div style={S.field}>
              <label style={S.label}>Password</label>
              <input
                style={S.input}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Enter password"
              />
            </div>
            <button style={S.btn} type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
            <div style={S.center}>
              <button style={S.link} type="button" onClick={() => { setShowForgot(true); setError(""); }}>
                Forgot password?
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSignup}>
            <div style={S.field}>
              <label style={S.label}>Username</label>
              <input
                style={S.input}
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                placeholder="Choose a username"
              />
            </div>
            <div style={S.field}>
              <label style={S.label}>Email</label>
              <input
                style={S.input}
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="Enter email"
              />
            </div>
            <div style={S.field}>
              <label style={S.label}>Password</label>
              <input
                style={S.input}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="Choose a password"
              />
            </div>
            <button style={S.btn} type="submit" disabled={loading}>
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
