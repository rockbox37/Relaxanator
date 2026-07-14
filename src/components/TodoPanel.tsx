"use client";

import { useState, type FormEvent } from "react";

import {
  type TodoItem,
  formatReminderLabel,
  normalizeReminderTime,
} from "@/lib/todos";

interface TodoPanelProps {
  items: readonly TodoItem[];
  onAdd: (text: string, reminderTime: string | null) => void;
  onUpdate: (
    id: string,
    update: { text?: string; reminderTime?: string | null },
  ) => void;
  onDelete: (id: string) => void;
}

export default function TodoPanel({
  items,
  onAdd,
  onUpdate,
  onDelete,
}: TodoPanelProps) {
  const [draftText, setDraftText] = useState("");
  const [draftReminder, setDraftReminder] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editReminder, setEditReminder] = useState("");

  function submitAdd(e: FormEvent) {
    e.preventDefault();
    const text = draftText.trim();
    if (!text) return;
    onAdd(text, normalizeReminderTime(draftReminder));
    setDraftText("");
    setDraftReminder("");
  }

  function beginEdit(item: TodoItem) {
    setEditingId(item.id);
    setEditText(item.text);
    setEditReminder(item.reminderTime ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
    setEditReminder("");
  }

  function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const text = editText.trim();
    if (!text) return;
    onUpdate(editingId, {
      text,
      reminderTime: normalizeReminderTime(editReminder),
    });
    cancelEdit();
  }

  return (
    <section className="meditation todos" aria-label="ToDo list">
      <h2>ToDo list</h2>
      <p className="todo-note">
        Capture tasks with an optional reminder time. Overdue reminders escalate
        in the banner above.
      </p>

      <form className="todo-add" onSubmit={submitAdd}>
        <label className="todo-field todo-field-text">
          <span className="todo-field-label">New item</span>
          <input
            type="text"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            maxLength={200}
            placeholder="Call to schedule doctor appointment"
            aria-label="New ToDo text"
          />
        </label>
        <label className="todo-field todo-field-time">
          <span className="todo-field-label">Remind at</span>
          <input
            type="time"
            value={draftReminder}
            onChange={(e) => setDraftReminder(e.target.value)}
            aria-label="Optional reminder time"
          />
        </label>
        <button type="submit" className="todo-add-btn" disabled={!draftText.trim()}>
          Add
        </button>
      </form>

      {items.length === 0 ? (
        <p className="todo-empty">No ToDos yet.</p>
      ) : (
        <ul className="todo-list">
          {items.map((item) => (
            <li key={item.id} className="todo-item voice">
              {editingId === item.id ? (
                <form className="todo-edit" onSubmit={submitEdit}>
                  <label className="todo-field todo-field-text">
                    <span className="visually-hidden">Edit text</span>
                    <input
                      type="text"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      maxLength={200}
                      aria-label="Edit ToDo text"
                    />
                  </label>
                  <label className="todo-field todo-field-time">
                    <span className="visually-hidden">Edit reminder</span>
                    <input
                      type="time"
                      value={editReminder}
                      onChange={(e) => setEditReminder(e.target.value)}
                      aria-label="Edit reminder time"
                    />
                  </label>
                  <div className="todo-item-actions">
                    <button type="submit" className="todo-save-btn">
                      Save
                    </button>
                    <button
                      type="button"
                      className="todo-cancel-btn"
                      onClick={cancelEdit}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="todo-item-body">
                    <span className="todo-item-text">{item.text}</span>
                    {item.reminderTime ? (
                      <span className="todo-item-reminder">
                        Remind {formatReminderLabel(item.reminderTime)}
                      </span>
                    ) : (
                      <span className="todo-item-reminder todo-item-reminder--none">
                        No reminder
                      </span>
                    )}
                  </div>
                  <div className="todo-item-actions">
                    <button
                      type="button"
                      className="todo-edit-btn"
                      onClick={() => beginEdit(item)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="todo-delete-btn"
                      onClick={() => onDelete(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
