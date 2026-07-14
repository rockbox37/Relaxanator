"use client";

import type { ActiveTodoReminder } from "@/lib/todos";
import { TODO_SNOOZE_MIN, formatReminderLabel } from "@/lib/todos";

interface TodoReminderBannerProps {
  reminder: ActiveTodoReminder;
  onDone: (id: string) => void;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  snoozeMin?: number;
}

export default function TodoReminderBanner({
  reminder,
  onDone,
  onDismiss,
  onSnooze,
  snoozeMin = TODO_SNOOZE_MIN,
}: TodoReminderBannerProps) {
  const { item, urgency } = reminder;
  const when = formatReminderLabel(item.reminderTime);

  return (
    <div
      className={`todo-banner todo-banner--${urgency}`}
      role="status"
      aria-live={urgency === "critical" || urgency === "urgent" ? "assertive" : "polite"}
      aria-atomic="true"
      data-todo-id={item.id}
      data-todo-urgency={urgency}
    >
      <p className="todo-banner-message">
        <span className="todo-banner-label">ToDo reminder</span>
        {item.text}
        {when ? <span className="todo-banner-when"> · was due {when}</span> : null}
      </p>
      <div className="todo-banner-actions">
        <button
          type="button"
          className="todo-banner-done"
          onClick={() => onDone(item.id)}
        >
          Done
        </button>
        <button
          type="button"
          className="todo-banner-snooze"
          onClick={() => onSnooze(item.id)}
        >
          Snooze {snoozeMin} min
        </button>
        <button
          type="button"
          className="todo-banner-dismiss"
          onClick={() => onDismiss(item.id)}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

interface TodoReminderStackProps {
  reminders: readonly ActiveTodoReminder[];
  onDone: (id: string) => void;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  snoozeMin?: number;
}

/**
 * Renders due ToDo reminders as a vertical stack (sibling to break banners).
 * Prominence escalates via urgency class as overdue duration grows (#76).
 */
export function TodoReminderStack({
  reminders,
  onDone,
  onDismiss,
  onSnooze,
  snoozeMin = TODO_SNOOZE_MIN,
}: TodoReminderStackProps) {
  if (reminders.length === 0) return null;

  return (
    <div
      className="todo-banner-stack"
      role="region"
      aria-label="ToDo reminders"
    >
      {reminders.map((reminder) => (
        <TodoReminderBanner
          key={reminder.item.id}
          reminder={reminder}
          onDone={onDone}
          onDismiss={onDismiss}
          onSnooze={onSnooze}
          snoozeMin={snoozeMin}
        />
      ))}
    </div>
  );
}
