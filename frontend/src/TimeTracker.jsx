import { useState, useEffect, useRef } from "react";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "./api";

function formatHM(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
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

const ACTIVE_SESSION_KEY = "timelog_active_session";

export default function TimeTracker({ username, onLogout }) {
  const [categories, setCategories] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeCategory, setActiveCategory] = useState(null);
  const [activeStart, setActiveStart] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [ending, setEnding] = useState(false);

  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [view, setView] = useState("today");

  const tickRef = useRef(null);

  useEffect(() => {
    loadData();

    const saved = window.sessionStorage.getItem(ACTIVE_SESSION_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      setActiveCategory(parsed.category);
      setActiveStart(parsed.start);
    }
  }, []);

  useEffect(() => {
    if (activeCategory) {
      tickRef.current = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(tickRef.current);
    }
  }, [activeCategory]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [cats, sess] = await Promise.all([api.getCategories(), api.getSessions()]);
      setCategories(cats);
      setSessions(sess);
    } catch (err) {
      setError("Could not load your data. " + err.message);
    } finally {
      setLoading(false);
    }
  }

  function startSession(category) {
    if (activeCategory) return;
    const start = Date.now();
    setActiveCategory(category);
    setActiveStart(start);
    window.sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify({ category, start }));
  }

  async function endSession() {
    if (!activeCategory || ending) return;
    setEnding(true);
    const end = Date.now();
    try {
      const saved = await api.createSession(activeCategory.id, activeStart, end);
      setSessions((prev) => [saved, ...prev]);
      window.sessionStorage.removeItem(ACTIVE_SESSION_KEY);
      setActiveCategory(null);
      setActiveStart(null);
    } catch (err) {
      setError("Could not save that session. " + err.message);
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
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const weekSessions = sessions.filter((s) => {
    const sd = new Date(s.start_ms);
    return sd >= weekStart && sd < new Date(weekStart.getTime() + 7 * 86400000);
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
    color: c.color,
  }));

  const busiestDay = dailyChartData.reduce((max, d) => (d.hours > max.hours ? d : max), { day: "-", hours: 0 });
  const topCategory = categoryTotals.reduce((max, c) => (c.total > max.total ? c : max), { name: "-", total: 0 });
  const avgPerDay = weekTotal / 7;
  const liveElapsed = activeCategory ? now - activeStart : 0;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", fontFamily: "var(--font-sans)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Time log</h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: 14, margin: "4px 0 0" }}>
            {username} · {today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button
            onClick={() => setView("today")}
            style={{ fontSize: 13, padding: "6px 12px", background: view === "today" ? "var(--color-background-secondary)" : "transparent" }}
          >
            Today
          </button>
          <button
            onClick={() => setView("week")}
            style={{ fontSize: 13, padding: "6px 12px", background: view === "week" ? "var(--color-background-secondary)" : "transparent" }}
          >
            Weekly report
          </button>
          <button onClick={onLogout} style={{ fontSize: 13, padding: "6px 12px", marginLeft: 8 }}>
            Sign out
          </button>
        </div>
      </div>

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
            background: "var(--color-background-secondary)",
            borderRadius: "var(--border-radius-lg)",
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: activeCategory.color, display: "inline-block" }} />
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{activeCategory.name}</p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-secondary)" }}>
                started {new Date(activeStart).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 22, fontWeight: 500, fontFamily: "var(--font-mono)" }}>{formatHM(liveElapsed)}</span>
            <button onClick={endSession} disabled={ending} style={{ fontSize: 13, padding: "8px 16px" }}>
              <i className="ti ti-player-stop" style={{ fontSize: 16, verticalAlign: "-3px", marginRight: 4 }} aria-hidden="true"></i>
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
                    onClick={() => startSession(c)}
                    disabled={!!activeCategory}
                    style={{ width: "100%", textAlign: "left", padding: "12px 14px", opacity: activeCategory ? 0.5 : 1, display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 14 }}>{c.name}</span>
                  </button>
                  {!activeCategory && (
                    <button
                      onClick={() => deleteCategory(c.id)}
                      aria-label={`Remove ${c.name}`}
                      style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, padding: 0, borderRadius: "50%", fontSize: 10, background: "var(--color-background-primary)", lineHeight: "16px" }}
                    >
                      <i className="ti ti-x" style={{ fontSize: 11 }} aria-hidden="true"></i>
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
                <button onClick={() => setShowAddCategory(true)} style={{ fontSize: 13, padding: "12px 14px", color: "var(--color-text-secondary)" }}>
                  <i className="ti ti-plus" style={{ fontSize: 14, verticalAlign: "-2px", marginRight: 4 }} aria-hidden="true"></i>
                  New activity
                </button>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: "1.5rem" }}>
            <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Logged today</p>
              <p style={{ fontSize: 24, fontWeight: 500, margin: 0 }}>{formatHM(todayTotal)}</p>
            </div>
            <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Sessions today</p>
              <p style={{ fontSize: 24, fontWeight: 500, margin: 0 }}>{todaySessions.length}</p>
            </div>
          </div>

          <div>
            <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 10 }}>Today's sessions</p>
            {todaySessions.length === 0 ? (
              <p style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>Nothing logged yet. Start a category above when you begin.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {todaySessions.map((s) => (
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
            )}
          </div>
        </>
      )}

      {view === "week" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: "1.5rem" }}>
            <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>This week</p>
              <p style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>{formatHours(weekTotal)}h</p>
            </div>
            <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Daily average</p>
              <p style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>{formatHours(avgPerDay)}h</p>
            </div>
            <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "1rem" }}>
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Top activity</p>
              <p style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>{topCategory.name}</p>
            </div>
          </div>

          {weekSessions.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>
              No sessions logged this week yet. Once you start tracking, your weekly breakdown shows up here.
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
                      <Pie data={categoryChartData} dataKey="hours" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                        {categoryChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [`${v}h`, "Logged"]} contentStyle={{ fontSize: 13, borderRadius: 8 }} />
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

              <div style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: "1rem 1.25rem" }}>
                <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 8px" }}>Summary</p>
                <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 4px", lineHeight: 1.6 }}>
                  You logged {formatHours(weekTotal)} hours across {categoryTotals.length} activities this week.
                  {busiestDay.hours > 0 && ` ${busiestDay.day} was your busiest day at ${busiestDay.hours}h.`}
                  {topCategory.total > 0 && ` Most of your time went to ${topCategory.name}.`}
                </p>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
