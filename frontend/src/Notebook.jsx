import { useState, useEffect, useRef } from "react";
import { api } from "./api";

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function Notebook() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editContent, setEditContent] = useState("");
  const textareaRef = useRef(null);

  useEffect(() => {
    loadNotes();
  }, []);

  async function loadNotes() {
    setLoading(true);
    try {
      const data = await api.getNotes();
      setNotes(data);
    } catch (err) {
      setError("Could not load notes. " + err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveNote() {
    if (!draftContent.trim()) return;
    setSaving(true);
    try {
      const note = await api.createNote(draftContent.trim(), today());
      setNotes((prev) => [note, ...prev]);
      setDraftContent("");
    } catch (err) {
      setError("Could not save note. " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id) {
    if (!editContent.trim()) return;
    try {
      const updated = await api.updateNote(id, editContent.trim(), notes.find((n) => n.id === id).date);
      setNotes((prev) => prev.map((n) => (n.id === id ? updated : n)));
      setEditingId(null);
      setEditContent("");
    } catch (err) {
      setError("Could not update note. " + err.message);
    }
  }

  async function deleteNote(id) {
    try {
      await api.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      setError("Could not delete note. " + err.message);
    }
  }

  // Group notes by date
  const grouped = notes.reduce((acc, note) => {
    if (!acc[note.date]) acc[note.date] = [];
    acc[note.date].push(note);
    return acc;
  }, {});

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const todayStr = today();
  if (!grouped[todayStr]) sortedDates.unshift(todayStr);

  if (loading) return <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>Loading notebook...</p>;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      {error && (
        <div style={{ fontSize: 13, color: "var(--color-text-danger)", marginBottom: "1rem", padding: "8px 12px", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
        {sortedDates.map((date) => (
          <div key={date}>
            {/* Date header — like a notebook page */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "0.75rem" }}>
              <div style={{ height: 1, flex: 1, background: "var(--color-border-tertiary)" }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: date === todayStr ? "var(--color-text-info)" : "var(--color-text-secondary)", whiteSpace: "nowrap" }}>
                {date === todayStr ? "Today — " : ""}{formatDate(date)}
              </span>
              <div style={{ height: 1, flex: 1, background: "var(--color-border-tertiary)" }} />
            </div>

            {/* Write area for today */}
            {date === todayStr && (
              <div style={{ marginBottom: "1rem" }}>
                <textarea
                  ref={textareaRef}
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveNote();
                  }}
                  placeholder="Write something..."
                  rows={4}
                  style={{
                    width: "100%",
                    resize: "vertical",
                    fontSize: 14,
                    lineHeight: 1.7,
                    padding: "10px 12px",
                    border: "0.5px solid var(--color-border-secondary)",
                    borderRadius: 8,
                    fontFamily: "var(--font-sans)",
                    boxSizing: "border-box",
                    background: "var(--color-background-secondary)",
                  }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                  <button
                    onClick={saveNote}
                    disabled={saving || !draftContent.trim()}
                    style={{ fontSize: 13, padding: "6px 16px" }}
                  >
                    {saving ? "Saving..." : "Save  ⌘↵"}
                  </button>
                </div>
              </div>
            )}

            {/* Notes for this date */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(grouped[date] || []).map((note) => (
                <div
                  key={note.id}
                  style={{
                    background: "var(--color-background-secondary)",
                    border: "0.5px solid var(--color-border-tertiary)",
                    borderRadius: 8,
                    padding: "10px 14px",
                  }}
                >
                  {editingId === note.id ? (
                    <>
                      <textarea
                        autoFocus
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={4}
                        style={{
                          width: "100%",
                          resize: "vertical",
                          fontSize: 14,
                          lineHeight: 1.7,
                          padding: "8px 10px",
                          border: "0.5px solid var(--color-border-secondary)",
                          borderRadius: 6,
                          fontFamily: "var(--font-sans)",
                          boxSizing: "border-box",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                        <button onClick={() => saveEdit(note.id)} style={{ fontSize: 12, padding: "4px 12px" }}>Save</button>
                        <button onClick={() => setEditingId(null)} style={{ fontSize: 12, padding: "4px 12px" }}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p style={{ fontSize: 14, lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap", color: "var(--color-text-primary)" }}>
                        {note.content}
                      </p>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                        <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>
                          {note.created_at ? new Date(note.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : ""}
                        </span>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => { setEditingId(note.id); setEditContent(note.content); }}
                            style={{ fontSize: 11, padding: "2px 8px", color: "var(--color-text-secondary)" }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteNote(note.id)}
                            style={{ fontSize: 11, padding: "2px 8px", color: "var(--color-text-danger)" }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {date !== todayStr && (!grouped[date] || grouped[date].length === 0) && (
                <p style={{ fontSize: 13, color: "var(--color-text-tertiary)", margin: 0 }}>No entries for this day.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
