import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "./api";

function formatHours(h) {
  return `${h}h`;
}

function lastNDays(n) {
  const days = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function dayLabel(date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function AdminDashboard({ onBack }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    setError("");
    try {
      const [statsData, usersData] = await Promise.all([api.getAdminStats(), api.getAdminUsers()]);
      setStats(statsData);
      setUsers(usersData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 900, margin: "4rem auto 0", textAlign: "center", fontFamily: "var(--font-sans)" }}>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>Loading usage data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 600, margin: "4rem auto 0", fontFamily: "var(--font-sans)" }}>
        <p style={{ fontSize: 14, color: "var(--color-text-danger)" }}>{error}</p>
        <button onClick={onBack} style={{ fontSize: 13, padding: "8px 14px", marginTop: 12 }}>
          Back to app
        </button>
      </div>
    );
  }

  const days30 = lastNDays(30);
  const signupChartData = days30.map((d) => ({
    day: dayLabel(d),
    signups: stats.signups_by_day[dayKey(d)] || 0,
  }));

  const activityChartData = days30.map((d) => ({
    day: dayLabel(d),
    sessions: stats.sessions_logged_by_day[dayKey(d)] || 0,
  }));

  const categoryEntries = Object.entries(stats.category_totals);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", fontFamily: "var(--font-sans)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.75rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, letterSpacing: "-0.01em" }}>Usage overview</h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: 14, margin: "4px 0 0" }}>
            Aggregate stats only — no individual session content or per-user activity is shown here.
          </p>
        </div>
        <button onClick={onBack} style={{ fontSize: 13, padding: "8px 14px" }}>
          Back to app
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: "2rem" }}>
        <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Total users</p>
          <p style={{ fontSize: 26, fontWeight: 600, margin: 0, fontVariantNumeric: "tabular-nums" }}>{stats.total_users}</p>
        </div>
        <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Active, last 7 days</p>
          <p style={{ fontSize: 26, fontWeight: 600, margin: 0, fontVariantNumeric: "tabular-nums" }}>{stats.active_users_last_7_days}</p>
        </div>
        <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Sessions logged</p>
          <p style={{ fontSize: 26, fontWeight: 600, margin: 0, fontVariantNumeric: "tabular-nums" }}>{stats.total_sessions}</p>
        </div>
        <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Total hours logged</p>
          <p style={{ fontSize: 26, fontWeight: 600, margin: 0, fontVariantNumeric: "tabular-nums" }}>{formatHours(stats.total_hours_logged)}</p>
        </div>
      </div>

      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>Signups, last 30 days</p>
      <div style={{ height: 180, marginBottom: "2rem" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={signupChartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-tertiary)" />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 13, borderRadius: 8 }} />
            <Bar dataKey="signups" fill="#534AB7" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>Sessions logged, last 30 days</p>
      <div style={{ height: 180, marginBottom: "2rem" }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={activityChartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-tertiary)" />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
            <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 13, borderRadius: 8 }} />
            <Bar dataKey="sessions" fill="#0F6E56" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 10 }}>
        Activity categories, across all users combined
      </p>
      {categoryEntries.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>No sessions logged yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1rem" }}>
          {categoryEntries.map(([name, v]) => (
            <div
              key={name}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)" }}
            >
              <span style={{ fontSize: 13, fontWeight: 500 }}>{name}</span>
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                {v.sessions} session{v.sessions !== 1 ? "s" : ""} · {v.hours}h total
              </span>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 10, marginTop: "2rem" }}>
        Users — for troubleshooting only, no session content shown
      </p>
      {users.length === 0 ? (
        <p style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>No users yet.</p>
      ) : (
        <div style={{ overflowX: "auto", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--color-background-secondary)", textAlign: "left" }}>
                <th style={{ padding: "8px 12px", fontWeight: 600, fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>ID</th>
                <th style={{ padding: "8px 12px", fontWeight: 600, fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Username</th>
                <th style={{ padding: "8px 12px", fontWeight: 600, fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Signed up</th>
                <th style={{ padding: "8px 12px", fontWeight: 600, fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Sessions</th>
                <th style={{ padding: "8px 12px", fontWeight: 600, fontSize: 11, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Last active</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                  <td style={{ padding: "8px 12px", fontVariantNumeric: "tabular-nums", color: "var(--color-text-secondary)" }}>{u.id}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 500 }}>
                    {u.username}
                    {u.is_admin && (
                      <span style={{ marginLeft: 6, fontSize: 10, color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 4, padding: "1px 5px" }}>
                        admin
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "8px 12px", color: "var(--color-text-secondary)" }}>
                    {u.signed_up_at ? new Date(u.signed_up_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}
                  </td>
                  <td style={{ padding: "8px 12px", fontVariantNumeric: "tabular-nums" }}>{u.session_count}</td>
                  <td style={{ padding: "8px 12px", color: "var(--color-text-secondary)" }}>
                    {u.last_active_ms ? new Date(u.last_active_ms).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: "1.5rem" }}>
        This view never shows which user logged what, or any individual session's time of day. It's meant to answer
        "is this being used" without exposing what any one student is doing.
      </p>
    </div>
  );
}
