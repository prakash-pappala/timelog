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

export default function AccountSettings({ onBack }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!currentPassword || !newPassword) {
      setError("Fill in both your current and new password.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password should be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords don't match.");
      return;
    }

    setSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setSuccess("Password changed.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", fontFamily: "var(--font-sans)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.75rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, letterSpacing: "-0.01em" }}>Account</h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: 14, margin: "4px 0 0" }}>
            Update your password
          </p>
        </div>
        <button onClick={onBack} style={{ fontSize: 13, padding: "8px 14px" }}>
          Back to app
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          maxWidth: 360,
          background: "var(--color-background-secondary)",
          border: "0.5px solid var(--color-border-tertiary)",
          borderRadius: "var(--border-radius-lg)",
          padding: "1.25rem",
        }}
      >
        <PasswordField label="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoFocus />
        <PasswordField label="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        <PasswordField label="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />

        {error && <p style={{ fontSize: 13, color: "var(--color-text-danger)", margin: 0 }}>{error}</p>}
        {success && <p style={{ fontSize: 13, color: "var(--color-text-success)", margin: 0 }}>{success}</p>}

        <button type="submit" disabled={saving} style={{ fontSize: 14, padding: "10px 0", marginTop: 4, fontWeight: 600 }}>
          {saving ? "Saving..." : "Change password"}
        </button>
      </form>
    </div>
  );
}
