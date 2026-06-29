import { useState, useEffect } from "react";
import { api } from "./api";

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function TodoList() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newText, setNewText] = useState("");
  const [newDate, setNewDate] = useState(today());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadTodos();
  }, []);

  async function loadTodos() {
    setLoading(true);
    try {
      const data = await api.getTodos();
      setTodos(data);
    } catch (err) {
      setError("Could not load tasks. " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function addTodo() {
    if (!newText.trim()) return;
    setAdding(true);
    try {
      const todo = await api.createTodo(newText.trim(), newDate);
      setTodos((prev) => {
        const next = [todo, ...prev];
        return next.sort((a, b) => b.date.localeCompare(a.date) || new Date(a.created_at) - new Date(b.created_at));
      });
      setNewText("");
    } catch (err) {
      setError("Could not add task. " + err.message);
    } finally {
      setAdding(false);
    }
  }

  async function toggleDone(id, done) {
    try {
      const updated = await api.updateTodo(id, { done: !done });
      setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (err) {
      setError("Could not update task. " + err.message);
    }
  }

  async function deleteTodo(id) {
    try {
      await api.deleteTodo(id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError("Could not delete task. " + err.message);
    }
  }

  const grouped = todos.reduce((acc, t) => {
    if (!acc[t.date]) acc[t.date] = [];
    acc[t.date].push(t);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const todayStr = today();
  if (!grouped[todayStr]) sortedDates.unshift(todayStr);

  if (loading) return <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>Loading tasks...</p>;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      {error && (
        <div style={{ fontSize: 13, color: "var(--color-text-danger)", marginBottom: "1rem", padding: "8px 12px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8 }}>
          {error}
        </div>
      )}

      {/* Add task */}
      <div style={{ display: "flex", gap: 8, marginBottom: "2rem", flexWrap: "wrap" }}>
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTodo()}
          placeholder="Add a task..."
          style={{ flex: 1, minWidth: 200, fontSize: 14 }}
        />
        <input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          style={{ fontSize: 13 }}
        />
        <button
          onClick={addTodo}
          disabled={adding || !newText.trim()}
          style={{ fontSize: 13, padding: "8px 16px" }}
        >
          {adding ? "Adding..." : "Add"}
        </button>
      </div>

      {/* Grouped by date — paper planner style */}
      <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        {sortedDates.map((date) => {
          const dayTodos = grouped[date] || [];
          const pending = dayTodos.filter((t) => !t.done).length;
          const done = dayTodos.filter((t) => t.done).length;

          return (
            <div key={date}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "0.75rem" }}>
                <div style={{ height: 1, flex: 1, background: "var(--color-border-tertiary)" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: date === todayStr ? "var(--color-text-info)" : "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                    {date === todayStr ? "Today — " : ""}{formatDate(date)}
                  </span>
                  {dayTodos.length > 0 && (
                    <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                      {done}/{dayTodos.length} done
                    </span>
                  )}
                </div>
                <div style={{ height: 1, flex: 1, background: "var(--color-border-tertiary)" }} />
              </div>

              {dayTodos.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: 0 }}>
                  No tasks for this day.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* Pending tasks first */}
                  {dayTodos.filter((t) => !t.done).map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 12px",
                        background: "var(--color-background-secondary)",
                        border: "0.5px solid var(--color-border-tertiary)",
                        borderRadius: 8,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => toggleDone(t.id, t.done)}
                        style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }}
                      />
                      <span style={{ fontSize: 14, flex: 1, color: "var(--color-text-primary)" }}>{t.text}</span>
                      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                        {t.created_at ? new Date(t.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : ""}
                      </span>
                      <button
                        onClick={() => deleteTodo(t.id)}
                        style={{ fontSize: 11, padding: "2px 8px", color: "var(--color-text-danger)", flexShrink: 0 }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}

                  {/* Completed tasks */}
                  {dayTodos.filter((t) => t.done).map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "9px 12px",
                        background: "var(--color-background-secondary)",
                        border: "0.5px solid var(--color-border-tertiary)",
                        borderRadius: 8,
                        opacity: 0.6,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={true}
                        onChange={() => toggleDone(t.id, t.done)}
                        style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }}
                      />
                      <span style={{ fontSize: 14, flex: 1, color: "var(--color-text-secondary)", textDecoration: "line-through" }}>{t.text}</span>
                      <span style={{ fontSize: 11, color: "var(--color-text-tertiary)", flexShrink: 0 }}>
                        {t.created_at ? new Date(t.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : ""}
                      </span>
                      <button
                        onClick={() => deleteTodo(t.id)}
                        style={{ fontSize: 11, padding: "2px 8px", color: "var(--color-text-danger)", flexShrink: 0 }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
