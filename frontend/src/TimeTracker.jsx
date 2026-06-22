import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "./api";
import AdminDashboard from "./AdminDashboard";
import AccountSettings from "./AccountSettings";

function formatHM(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatHMS(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (h === 0) return `${m}:${pad(s)}`;
  return `${h}:${pad(m)}:${pad(s)}`;
}

function formatHours(ms) {
  return (ms / 3600000).toFixed(1);
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function dayLabel(date) {
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function timeStringToMs(baseDate, timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

function msToTimeString(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function DayTimeline({ daySessions, dayStart }) {
  const hourMarks = [0, 6, 12, 18, 24];

  return (
    <div>
      <div style={{ position: "relative", height: 36, background: "var(--color-background-secondary)", borderRadius: 8, overflow: "hidden", border: "0.5px solid var(--color-border-tertiary)" }}>
        {daySessions.map((s) => {
          const startOffset = Math.max(0, s.start_ms - dayStart);
          const endOffset = Math.min(86400000, s.end_ms - dayStart);
          const leftPct = (startOffset / 86400000) * 100;
          const widthPct = Math.max(0.3, ((endOffset - startOffset) / 86400000) * 100);
          return (
            <div
              key={s.id}
              title={`${s.category_name}: ${new Date(s.start_ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} – ${new Date(s.end_ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                background: s.color,
                opacity: 0.85,
              }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        {hourMarks.map((h) => (
          <span key={h} style={{ fontSize: 10, color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {h === 0 ? "12am" : h === 12 ? "12pm" : h < 12 ? `${h}am` : `${h - 12}pm`}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function TimeTracker({ username, isAdmin, onLogout }) {
  const [categories, setCategories] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeCategory, setActiveCategory] = useState(null);
  const [activeStart, setActiveStart] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [ending, setEnding] = useState(false);

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [view, setView] = useState("today");
  const [reportMode, setReportMode] = useState("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });

  const [manualCategoryId, setManualCategoryId] = useState("");
  const [manualFrom, setManualFrom] = useState("");
  const [manualTo, setManualTo] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editFrom, setEditFrom] = useState("");
  const [editTo, setEditTo] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const tickRef = useRef(null);
  const pollRef = useRef(null);

  useEffect(() => {
    loadData();
    loadActiveSession();
  }, []);

  useEffect(() => {
    if (activeCategory) {
      tickRef.current = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(tickRef.current);
    }
  }, [activeCategory]);

  useEffect(() => {
    if (activeSessionId) {
      pollRef.current = setInterval(checkActiveSessionStillRunning, 12000);
      return () => clearInterval(pollRef.current);
    }
  }, [activeSessionId]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [cats, sess] = await Promise.all([api.getCategories(), api.getSessions()]);

      // First-time users (zero categories) get defaults seeded automatically.
      // The backend does this at signup too, but this handles edge cases like
      // a user deleting everything or signing up before the backend change deployed.
      if (cats.length === 0) {
        const defaults = [
          { name: "Study",       color: "#534AB7" },
          { name: "Work",        color: "#0F6E56" },
          { name: "Classes",     color: "#185FA5" },
          { name: "Research",    color: "#993C1D" },
          { name: "Instagram",   color: "#C13584" },
          { name: "YouTube",     color: "#CC0000" },
          { name: "Twitter / X", color: "#1D9BF0" },
          { name: "TikTok",      color: "#010101" },
        ];
        const created = [];
        for (const { name, color } of defaults) {
          try {
            const cat = await api.createCategory(name, color);
            created.push(cat);
          } catch (_) {
            // skip any individual failure — not fatal
          }
        }
        setCategories(created);
      } else {
        setCategories(cats);
      }

      setSessions(sess);
    } catch (err) {
      setError("Could not load your data. " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadActiveSession() {
    try {
      const active = await api.getActiveSession();
      if (active) {
        setActiveCategory({ id: active.category_id, name: active.category_name, color: active.color });
        setActiveStart(active.start_ms);
        setActiveSessionId(active.id);
      }
    } catch (err) {
      // not fatal — just means no active session, or a transient network issue
    }
  }

  async function checkActiveSessionStillRunning() {
    try {
      const active = await api.getActiveSession();
      if (!active) {
        // It was ended somewhere else — pull the freshly closed session into history and clear local state
        setActiveCategory(null);
        setActiveStart(null);
        setActiveSessionId(null);
        const sess = await api.getSessions();
        setSessions(sess);
      }
    } catch (err) {
      // transient network hiccup — try again on the next poll, don't surface an error for this
    }
  }

  async function startSession(category) {
    if (activeCategory) return;
    const start = Date.now();
    try {
      const created = await api.startSession(category.id, start);
      setActiveCategory(category);
      setActiveStart(start);
      setActiveSessionId(created.id);
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes("already running")) {
        // Another device started one a moment ago — pick up that session instead of erroring out.
        await loadActiveSession();
      } else {
        setError("Could not start that session. " + err.message);
      }
    }
  }

  async function endSession() {
    if (!activeCategory || !activeSessionId || ending) return;
    setEnding(true);
    const end = Date.now();
    try {
      const saved = await api.endActiveSession(activeSessionId, end);
      setSessions((prev) => [saved, ...prev]);
      setActiveCategory(null);
      setActiveStart(null);
      setActiveSessionId(null);
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes("already ended")) {
        // It was ended from another browser between the click and this request landing.
        // Not a real failure from the user's point of view — just sync up quietly.
        setActiveCategory(null);
        setActiveStart(null);
        setActiveSessionId(null);
        try {
          const sess = await api.getSessions();
          setSessions(sess);
        } catch (_) {}
      } else {
        setError("Could not save that session. " + err.message);
      }
    } finally {
      setEnding(false);
    }
  }

  async function addCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    try {
      const cat = await api.createCategory(name);
      setCategories((prev) => [...prev, cat]);
      setNewCategoryName("");
      setShowAddCategory(false);
    } catch (err) {
      setError("Could not add that activity. " + err.message);
    }
  }

  async function deleteCategory(id) {
    if (activeCategory && activeCategory.id === id) return;
    try {
      await api.deleteCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError("Could not remove that activity. " + err.message);
    }
  }

  async function submitManualEntry() {
    if (!manualCategoryId || !manualFrom || !manualTo) {
      setError("Pick an activity and both times to add an entry.");
      return;
    }
    const today = new Date();
    const startMs = timeStringToMs(today, manualFrom);
    const endMs = timeStringToMs(today, manualTo);

    if (endMs <= startMs) {
      setError("End time has to be after the start time.");
      return;
    }

    setManualSaving(true);
    setError("");
    try {
      const saved = await api.createSession(Number(manualCategoryId), startMs, endMs);
      setSessions((prev) => [saved, ...prev]);
      setManualCategoryId("");
      setManualFrom("");
      setManualTo("");
    } catch (err) {
      setError("Could not add that entry. " + err.message);
    } finally {
      setManualSaving(false);
    }
  }

  function startEditSession(s) {
    setEditingSessionId(s.id);
    setEditCategoryId(String(s.category_id));
    setEditFrom(msToTimeString(s.start_ms));
    setEditTo(msToTimeString(s.end_ms));
  }

  function cancelEdit() {
    setEditingSessionId(null);
    setEditCategoryId("");
    setEditFrom("");
    setEditTo("");
  }

  async function submitEditSession(originalSession) {
    if (!editCategoryId || !editFrom || !editTo) {
      setError("Pick an activity and both times to save this edit.");
      return;
    }
    const baseDate = new Date(originalSession.start_ms);
    const startMs = timeStringToMs(baseDate, editFrom);
    const endMs = timeStringToMs(baseDate, editTo);

    if (endMs <= startMs) {
      setError("End time has to be after the start time.");
      return;
    }

    setEditSaving(true);
    setError("");
    try {
      const updated = await api.updateSession(originalSession.id, Number(editCategoryId), startMs, endMs);
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      cancelEdit();
    } catch (err) {
      setError("Could not save that edit. " + err.message);
    } finally {
      setEditSaving(false);
    }
  }

  async function removeSession(id) {
    try {
      await api.deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError("Could not delete that entry. " + err.message);
    }
  }

  if (loading) {
    return (
      <div style={{ maxWidth: 720, margin: "4rem auto 0", textAlign: "center", fontFamily: "var(--font-sans)" }}>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 14 }}>Loading your log...</p>
      </div>
    );
  }

  const today = new Date();
  const todaySessions = sessions.filter((s) => sameDay(new Date(s.start_ms), today));
  const todayTotal = todaySessions.reduce((sum, s) => sum + s.duration_ms, 0);

  const weekStart = getWeekStart(today);
  weekStart.setDate(weekStart.getDate() + weekOffset * 7);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const weekSessions = sessions.filter((s) => {
    const sd = new Date(s.start_ms);
    return sd >= weekStart && sd < weekEnd;
  });

  const weekTotal = weekSessions.reduce((sum, s) => sum + s.duration_ms, 0);

  const dailyChartData = weekDays.map((d) => {
    const dayTotal = weekSessions
      .filter((s) => sameDay(new Date(s.start_ms), d))
      .reduce((sum, s) => sum + s.duration_ms, 0);
    return { day: dayLabel(d), hours: Number((dayTotal / 3600000).toFixed(2)) };
  });

  const categoryTotals = categories
    .map((c) => {
      const total = weekSessions
        .filter((s) => s.category_id === c.id)
        .reduce((sum, s) => sum + s.duration_ms, 0);
      return { ...c, total };
    })
    .filter((c) => c.total > 0);

  const categoryChartData = categoryTotals.map((c) => ({
    name: c.name,
    hours: Number((c.total / 3600000).toFixed(2)),
    minutes: Math.max(1, Math.round(c.total / 60000)),
    color: c.color,
  }));

  const busiestDay = dailyChartData.reduce((max, d) => (d.hours > max.hours ? d : max), { day: "-", hours: 0 });
  const topCategory = categoryTotals.reduce((max, c) => (c.total > max.total ? c : max), { name: "-", total: 0 });
  const avgPerDay = weekTotal / 7;
  const liveElapsed = activeCategory ? now - activeStart : 0;

  const isCurrentWeek = weekOffset === 0;
  const weekRangeLabel = `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date(weekEnd.getTime() - 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  const selectedDateObj = new Date(selectedDate + "T00:00:00");
  const dateSessions = sessions.filter((s) => sameDay(new Date(s.start_ms), selectedDateObj));
  const dateTotal = dateSessions.reduce((sum, s) => sum + s.duration_ms, 0);
  const dateCategoryTotals = categories
    .map((c) => {
      const total = dateSessions.filter((s) => s.category_id === c.id).reduce((sum, s) => sum + s.duration_ms, 0);
      return { ...c, total };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const availableYears = Array.from(
    new Set(sessions.map((s) => new Date(s.start_ms).getFullYear()))
  ).sort((a, b) => b - a);
  if (!availableYears.includes(today.getFullYear())) availableYears.unshift(today.getFullYear());

  const yearSessions = sessions.filter((s) => new Date(s.start_ms).getFullYear() === selectedYear);
  const yearTotal = yearSessions.reduce((sum, s) => sum + s.duration_ms, 0);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthlyChartData = monthNames.map((name, i) => {
    const monthTotal = yearSessions
      .filter((s) => new Date(s.start_ms).getMonth() === i)
      .reduce((sum, s) => sum + s.duration_ms, 0);
    return { month: name, hours: Number((monthTotal / 3600000).toFixed(1)) };
  });

  const yearCategoryTotals = categories
    .map((c) => {
      const total = yearSessions.filter((s) => s.category_id === c.id).reduce((sum, s) => sum + s.duration_ms, 0);
      return { ...c, total };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);

  const yearCategoryChartData = yearCategoryTotals.map((c) => ({ name: c.name, hours: Number((c.total / 3600000).toFixed(1)), minutes: Math.max(1, Math.round(c.total / 60000)), color: c.color }));
  const busiestMonth = monthlyChartData.reduce((max, m) => (m.hours > max.hours ? m : max), { month: "-", hours: 0 });
  const yearTopCategory = yearCategoryTotals.reduce((max, c) => (c.total > max.total ? c : max), { name: "-", total: 0 });

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", fontFamily: "var(--font-sans)" }}>
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.55; transform: scale(0.85); }
        }
        .timelog-cat-btn { transition: transform 0.12s ease, border-color 0.12s ease; }
        .timelog-cat-btn:hover:not(:disabled) { transform: translateY(-1px); }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.75rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, letterSpacing: "-0.01em" }}>Time log</h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: 14, margin: "4px 0 0" }}>
            {username} · {today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button
            onClick={() => setView("today")}
            style={{ fontSize: 13, padding: "6px 12px", fontWeight: view === "today" ? 600 : 400, background: view === "today" ? "var(--color-background-secondary)" : "transparent" }}
          >
            Today
          </button>
          <button
            onClick={() => setView("week")}
            style={{ fontSize: 13, padding: "6px 12px", fontWeight: view === "week" ? 600 : 400, background: view === "week" ? "var(--color-background-secondary)" : "transparent" }}
          >
            Reports
          </button>
          {isAdmin && (
            <button
              onClick={() => setView("admin")}
              style={{ fontSize: 13, padding: "6px 12px", fontWeight: view === "admin" ? 600 : 400, background: view === "admin" ? "var(--color-background-secondary)" : "transparent" }}
            >
              Admin
            </button>
          )}
          <button
            onClick={() => setView("account")}
            style={{ fontSize: 13, padding: "6px 12px", fontWeight: view === "account" ? 600 : 400, background: view === "account" ? "var(--color-background-secondary)" : "transparent" }}
          >
            Account
          </button>
          <button onClick={onLogout} style={{ fontSize: 13, padding: "6px 12px", marginLeft: 8, color: "var(--color-text-secondary)" }}>
            Sign out
          </button>
        </div>
      </div>

      {view === "admin" ? (
        <AdminDashboard onBack={() => setView("today")} />
      ) : view === "account" ? (
        <AccountSettings onBack={() => setView("today")} />
      ) : (
      <>

      {error && (
        <div
          style={{
            background: "var(--color-background-danger)",
            color: "var(--color-text-danger)",
            borderRadius: "var(--border-radius-md)",
            padding: "10px 14px",
            fontSize: 13,
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      {activeCategory && (
        <div
          style={{
            background: `linear-gradient(135deg, ${activeCategory.color}14, ${activeCategory.color}05)`,
            border: `1px solid ${activeCategory.color}33`,
            borderRadius: "var(--border-radius-lg)",
            padding: "1.1rem 1.4rem",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: activeCategory.color,
                display: "inline-block",
                boxShadow: `0 0 0 4px ${activeCategory.color}22`,
                animation: "pulse-dot 1.6s ease-in-out infinite",
              }}
            />
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{activeCategory.name}</p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>
                since {new Date(activeStart).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <span style={{ fontSize: 26, fontWeight: 600, fontFamily: "var(--font-mono)", letterSpacing: "0.01em", color: activeCategory.color, fontVariantNumeric: "tabular-nums" }}>
              {formatHMS(liveElapsed)}
            </span>
            <button
              onClick={endSession}
              disabled={ending}
              style={{ fontSize: 13, padding: "9px 18px", background: activeCategory.color, color: "#fff", border: "none", fontWeight: 500 }}
            >
              {ending ? "Saving..." : "End"}
            </button>
          </div>
        </div>
      )}

      {view === "today" && (
        <>
          <div style={{ marginBottom: "1.5rem" }}>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 10 }}>Pick what you are starting</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
              {categories.map((c) => (
                <div key={c.id} style={{ position: "relative" }}>
                  <button
                    className="timelog-cat-btn"
                    onClick={() => startSession(c)}
                    disabled={!!activeCategory}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "13px 14px",
                      opacity: activeCategory ? 0.45 : 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      borderLeft: `3px solid ${c.color}`,
                      borderTop: "0.5px solid var(--color-border-tertiary)",
                      borderRight: "0.5px solid var(--color-border-tertiary)",
                      borderBottom: "0.5px solid var(--color-border-tertiary)",
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</span>
                  </button>
                  {!activeCategory && (
                    <button
                      onClick={() => deleteCategory(c.id)}
                      aria-label={`Remove ${c.name}`}
                      style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, padding: 0, borderRadius: "50%", fontSize: 11, lineHeight: "16px", background: "var(--color-background-primary)" }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}

              {showAddCategory ? (
                <div style={{ display: "flex", gap: 4 }}>
                  <input
                    autoFocus
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCategory()}
                    placeholder="Guitar, thesis..."
                    style={{ fontSize: 13, flex: 1 }}
                  />
                  <button onClick={addCategory} style={{ fontSize: 13, padding: "0 10px" }}>
                    Add
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddCategory(true)}
                  style={{
                    fontSize: 13,
                    padding: "13px 14px",
                    color: "var(--color-text-secondary)",
                    border: "1px dashed var(--color-border-tertiary)",
                    fontWeight: 500,
                  }}
                >
                  + New activity
                </button>
              )}
            </div>
          </div>

          <div style={{ marginBottom: "1.75rem" }}>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>
              Forgot to track it live? Add it manually
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={manualCategoryId}
                onChange={(e) => setManualCategoryId(e.target.value)}
                style={{ fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", minWidth: 130, flex: "1 1 130px" }}
              >
                <option value="">Activity</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <input
                type="time"
                value={manualFrom}
                onChange={(e) => setManualFrom(e.target.value)}
                aria-label="From"
                style={{ fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", flex: "1 1 110px" }}
              />
              <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>to</span>
              <input
                type="time"
                value={manualTo}
                onChange={(e) => setManualTo(e.target.value)}
                aria-label="To"
                style={{ fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", flex: "1 1 110px" }}
              />
              <button
                onClick={submitManualEntry}
                disabled={manualSaving}
                style={{ fontSize: 13, padding: "8px 16px", background: "var(--color-background-secondary)", fontWeight: 600, flex: "0 0 auto" }}
              >
                {manualSaving ? "Saving..." : "Add"}
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: "1.5rem" }}>
            <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Logged today</p>
              <p style={{ fontSize: 26, fontWeight: 600, margin: 0, fontVariantNumeric: "tabular-nums" }}>{formatHM(todayTotal)}</p>
            </div>
            <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
              <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.04em" }}>Sessions today</p>
              <p style={{ fontSize: 26, fontWeight: 600, margin: 0, fontVariantNumeric: "tabular-nums" }}>{todaySessions.length}</p>
            </div>
          </div>

          <div>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 10 }}>Today's sessions</p>
            {todaySessions.length === 0 ? (
              <p style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>Nothing logged yet. Start a category above, or add it manually below.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {todaySessions.map((s) =>
                  editingSessionId === s.id ? (
                    <div
                      key={s.id}
                      style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "10px 14px", borderLeft: `3px solid ${s.color}`, border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)" }}
                    >
                      <select
                        value={editCategoryId}
                        onChange={(e) => setEditCategoryId(e.target.value)}
                        style={{ fontSize: 13, padding: "7px 9px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", flex: "1 1 120px" }}
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <input
                        type="time"
                        value={editFrom}
                        onChange={(e) => setEditFrom(e.target.value)}
                        style={{ fontSize: 13, padding: "7px 9px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", flex: "1 1 100px" }}
                      />
                      <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>to</span>
                      <input
                        type="time"
                        value={editTo}
                        onChange={(e) => setEditTo(e.target.value)}
                        style={{ fontSize: 13, padding: "7px 9px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)", flex: "1 1 100px" }}
                      />
                      <button onClick={() => submitEditSession(s)} disabled={editSaving} style={{ fontSize: 12, padding: "7px 12px", fontWeight: 600 }}>
                        {editSaving ? "Saving..." : "Save"}
                      </button>
                      <button onClick={cancelEdit} style={{ fontSize: 12, padding: "7px 12px" }}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div
                      key={s.id}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderLeft: `3px solid ${s.color}`, borderTop: "0.5px solid var(--color-border-tertiary)", borderRight: "0.5px solid var(--color-border-tertiary)", borderBottom: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)" }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{s.category_name}</span>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: "var(--color-text-secondary)" }}>
                        <span>
                          {new Date(s.start_ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                          {" – "}
                          {new Date(s.end_ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                        </span>
                        <span style={{ fontWeight: 600, color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>{formatHM(s.duration_ms)}</span>
                        <button onClick={() => startEditSession(s)} style={{ fontSize: 11, padding: "4px 9px", color: "var(--color-text-secondary)" }}>
                          Edit
                        </button>
                        <button onClick={() => removeSession(s.id)} style={{ fontSize: 11, padding: "4px 9px", color: "var(--color-text-secondary)" }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </>
      )}

      {view === "week" && (
        <>
          <div style={{ display: "inline-flex", gap: 2, marginBottom: "1.5rem", background: "var(--color-background-secondary)", padding: 3, borderRadius: 9 }}>
            <button
              onClick={() => setReportMode("week")}
              style={{ fontSize: 13, padding: "6px 14px", fontWeight: reportMode === "week" ? 600 : 400, background: reportMode === "week" ? "var(--color-background-primary)" : "transparent", border: "none", boxShadow: reportMode === "week" ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}
            >
              By week
            </button>
            <button
              onClick={() => setReportMode("date")}
              style={{ fontSize: 13, padding: "6px 14px", fontWeight: reportMode === "date" ? 600 : 400, background: reportMode === "date" ? "var(--color-background-primary)" : "transparent", border: "none", boxShadow: reportMode === "date" ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}
            >
              By date
            </button>
            <button
              onClick={() => setReportMode("year")}
              style={{ fontSize: 13, padding: "6px 14px", fontWeight: reportMode === "year" ? 600 : 400, background: reportMode === "year" ? "var(--color-background-primary)" : "transparent", border: "none", boxShadow: reportMode === "year" ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}
            >
              By year
            </button>
          </div>

          {reportMode === "week" && (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
                <button onClick={() => setWeekOffset((o) => o - 1)} style={{ fontSize: 16, fontWeight: 600, padding: "6px 14px" }}>
                  −
                </button>
                <div style={{ textAlign: "center" }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{weekRangeLabel}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>{isCurrentWeek ? "This week" : `${Math.abs(weekOffset)} week${Math.abs(weekOffset) > 1 ? "s" : ""} ago`}</p>
                </div>
                <button onClick={() => setWeekOffset((o) => Math.min(0, o + 1))} disabled={isCurrentWeek} style={{ fontSize: 16, fontWeight: 600, padding: "6px 14px", opacity: isCurrentWeek ? 0.4 : 1 }}>
                  +
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: "1.5rem" }}>
                <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Total</p>
                  <p style={{ fontSize: 22, fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatHours(weekTotal)}h</p>
                </div>
                <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Daily average</p>
                  <p style={{ fontSize: 22, fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatHours(avgPerDay)}h</p>
                </div>
                <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Top activity</p>
                  <p style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>{topCategory.name}</p>
                </div>
              </div>

              {weekSessions.length === 0 ? (
                <p style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>
                  Nothing logged for this week.
                </p>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>Hours by day</p>
                  <div style={{ height: 200, marginBottom: "2rem" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyChartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-tertiary)" />
                        <XAxis dataKey="day" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v) => [`${v}h`, "Logged"]} contentStyle={{ fontSize: 13, borderRadius: 8 }} />
                        <Bar dataKey="hours" fill="#534AB7" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>Time by activity</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: "2rem", flexWrap: "wrap" }}>
                    <div style={{ height: 200, width: 200, flexShrink: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={categoryChartData} dataKey="minutes" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                            {categoryChartData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v, n, p) => [formatHM(p.payload.minutes * 60000), p.payload.name]} contentStyle={{ fontSize: 13, borderRadius: 8 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 180 }}>
                      {categoryTotals
                        .sort((a, b) => b.total - a.total)
                        .map((c) => (
                          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
                              {c.name}
                            </span>
                            <span style={{ color: "var(--color-text-secondary)" }}>
                              {formatHours(c.total)}h ({Math.round((c.total / weekTotal) * 100)}%)
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>

                  <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem", marginBottom: "2rem" }}>
                    <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Summary</p>
                    <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px", lineHeight: 1.6 }}>
                      {formatHours(weekTotal)} hours logged across {categoryTotals.length} activities for {weekRangeLabel}.
                      {busiestDay.hours > 0 && ` ${busiestDay.day} was the busiest day at ${busiestDay.hours}h.`}
                      {topCategory.total > 0 && ` Most time went to ${topCategory.name}.`}
                    </p>
                  </div>

                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 10 }}>Day by day</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {weekDays.map((d) => {
                      const daySessions = weekSessions
                        .filter((s) => sameDay(new Date(s.start_ms), d))
                        .sort((a, b) => a.start_ms - b.start_ms);
                      const dayTotal = daySessions.reduce((sum, s) => sum + s.duration_ms, 0);
                      const isToday = sameDay(d, today);

                      return (
                        <div key={d.toISOString()}>
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
                            <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
                              {d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                              {isToday && <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}> · today</span>}
                            </p>
                            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0, fontVariantNumeric: "tabular-nums" }}>
                              {dayTotal > 0 ? formatHM(dayTotal) : "—"}
                            </p>
                          </div>

                          {daySessions.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <DayTimeline daySessions={daySessions} dayStart={new Date(d).setHours(0, 0, 0, 0)} />
                            </div>
                          )}

                          {daySessions.length === 0 ? (
                            <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: 0 }}>Nothing logged</p>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              {daySessions.map((s) => (
                                <div
                                  key={s.id}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "7px 12px",
                                    borderLeft: `3px solid ${s.color}`,
                                    background: "var(--color-background-secondary)",
                                    borderRadius: "var(--border-radius-sm)",
                                  }}
                                >
                                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>{s.category_name}</span>
                                  <div style={{ display: "flex", gap: 10, fontSize: 11.5, color: "var(--color-text-secondary)" }}>
                                    <span>
                                      {new Date(s.start_ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                                      {" – "}
                                      {new Date(s.end_ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                                    </span>
                                    <span style={{ fontWeight: 600, color: "var(--color-text-primary)", fontVariantNumeric: "tabular-nums" }}>
                                      {formatHM(s.duration_ms)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}

          {reportMode === "date" && (
            <>
              <div style={{ marginBottom: "1.5rem" }}>
                <input
                  type="date"
                  value={selectedDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  style={{ fontSize: 14, padding: "8px 10px" }}
                />
              </div>

              <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem", marginBottom: "1.5rem", maxWidth: 220 }}>
                <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Total logged</p>
                <p style={{ fontSize: 24, fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatHM(dateTotal)}</p>
              </div>

              {dateSessions.length > 0 && (
                <div style={{ marginBottom: "1.75rem" }}>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>24-hour view</p>
                  <DayTimeline daySessions={dateSessions} dayStart={new Date(selectedDateObj).setHours(0, 0, 0, 0)} />
                </div>
              )}

              {dateSessions.length === 0 ? (
                <p style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>Nothing logged on this date.</p>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 10 }}>Breakdown</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.5rem" }}>
                    {dateCategoryTotals.map((c) => (
                      <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
                          {c.name}
                        </span>
                        <span style={{ color: "var(--color-text-secondary)" }}>
                          {formatHM(c.total)} ({Math.round((c.total / dateTotal) * 100)}%)
                        </span>
                      </div>
                    ))}
                  </div>

                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 10 }}>Sessions</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {dateSessions.map((s) => (
                      <div
                        key={s.id}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-md)" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
                          <span style={{ fontSize: 13 }}>{s.category_name}</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--color-text-secondary)" }}>
                          <span>
                            {new Date(s.start_ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                            {" – "}
                            {new Date(s.end_ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                          </span>
                          <span style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{formatHM(s.duration_ms)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {reportMode === "year" && (
            <>
              <div style={{ marginBottom: "1.5rem" }}>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  style={{ fontSize: 14, padding: "8px 10px", borderRadius: 8, border: "0.5px solid var(--color-border-tertiary)" }}
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: "1.5rem" }}>
                <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Total this year</p>
                  <p style={{ fontSize: 22, fontWeight: 600, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{formatHours(yearTotal)}h</p>
                </div>
                <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Busiest month</p>
                  <p style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>{busiestMonth.month}</p>
                </div>
                <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Top activity</p>
                  <p style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>{yearTopCategory.name}</p>
                </div>
              </div>

              {yearSessions.length === 0 ? (
                <p style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>No sessions logged in {selectedYear}.</p>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>Hours by month</p>
                  <div style={{ height: 220, marginBottom: "2rem" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyChartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-tertiary)" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v) => [`${v}h`, "Logged"]} contentStyle={{ fontSize: 13, borderRadius: 8 }} />
                        <Bar dataKey="hours" fill="#0F6E56" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 8 }}>Time by activity</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 24, marginBottom: "2rem", flexWrap: "wrap" }}>
                    <div style={{ height: 200, width: 200, flexShrink: 0 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={yearCategoryChartData} dataKey="minutes" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                            {yearCategoryChartData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v, n, p) => [formatHM(p.payload.minutes * 60000), p.payload.name]} contentStyle={{ fontSize: 13, borderRadius: 8 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 180 }}>
                      {yearCategoryTotals.map((c) => (
                        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color }} />
                            {c.name}
                          </span>
                          <span style={{ color: "var(--color-text-secondary)" }}>
                            {formatHours(c.total)}h ({Math.round((c.total / yearTotal) * 100)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem", marginBottom: "2rem" }}>
                    <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Summary</p>
                    <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px", lineHeight: 1.6 }}>
                      {formatHours(yearTotal)} hours logged across {yearCategoryTotals.length} activities in {selectedYear}.
                      {busiestMonth.hours > 0 && ` ${busiestMonth.month} was the busiest month at ${busiestMonth.hours}h.`}
                      {yearTopCategory.total > 0 && ` Most time overall went to ${yearTopCategory.name}.`}
                    </p>
                  </div>

                  <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 10 }}>Month by month</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {monthNames.map((name, i) => {
                      const monthSessions = yearSessions
                        .filter((s) => new Date(s.start_ms).getMonth() === i)
                        .sort((a, b) => a.start_ms - b.start_ms);
                      if (monthSessions.length === 0) return null;

                      const monthTotal = monthSessions.reduce((sum, s) => sum + s.duration_ms, 0);
                      const byDay = {};
                      monthSessions.forEach((s) => {
                        const dayKey = new Date(s.start_ms).getDate();
                        if (!byDay[dayKey]) byDay[dayKey] = [];
                        byDay[dayKey].push(s);
                      });

                      return (
                        <div key={name}>
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                            <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{name} {selectedYear}</p>
                            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0, fontVariantNumeric: "tabular-nums" }}>
                              {formatHours(monthTotal)}h total
                            </p>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {Object.keys(byDay)
                              .sort((a, b) => Number(a) - Number(b))
                              .map((dayKey) => {
                                const daySessions = byDay[dayKey];
                                const dayDate = new Date(daySessions[0].start_ms);
                                const dayTotal = daySessions.reduce((sum, s) => sum + s.duration_ms, 0);
                                return (
                                  <div key={dayKey} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 12.5 }}>
                                    <span style={{ width: 64, flexShrink: 0, color: "var(--color-text-secondary)" }}>
                                      {dayDate.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                                    </span>
                                    <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 6 }}>
                                      {daySessions.map((s) => (
                                        <span
                                          key={s.id}
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 5,
                                            padding: "3px 9px",
                                            borderRadius: 100,
                                            background: `${s.color}15`,
                                            border: `1px solid ${s.color}33`,
                                            fontSize: 11.5,
                                          }}
                                        >
                                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color }} />
                                          {s.category_name} · {formatHM(s.duration_ms)}
                                        </span>
                                      ))}
                                    </div>
                                    <span style={{ flexShrink: 0, color: "var(--color-text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                                      {formatHM(dayTotal)}
                                    </span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
}
