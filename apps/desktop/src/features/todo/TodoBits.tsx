import { minuteText, parseMinute, SCHEDULE_WEEKDAYS, TODO_SOURCE_KEYS } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { Todo, TodoRepeat } from "@xiaoban/protocol";
import { type ReactNode, useState } from "react";
import { useHub } from "../../app/hub.tsx";

export function TodoCircle({
  done,
  late = false,
  label,
  onClick,
}: {
  done: boolean;
  late?: boolean;
  label: string;
  onClick?: (() => void) | undefined;
}) {
  return (
    <button
      type="button"
      className="todo-circle"
      aria-pressed={done}
      aria-label={label}
      data-done={done || undefined}
      data-late={late || undefined}
      disabled={!onClick}
      onClick={onClick}
    >
      {done && (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 12l5 5 9-10" />
        </svg>
      )}
    </button>
  );
}

export function TodoRow({
  todo,
  line,
  repeat,
  late = false,
  onToggle,
  onOpen,
  children,
}: {
  todo: Todo;
  line: string;
  repeat?: string | null | undefined;
  late?: boolean;
  onToggle?: (() => void) | undefined;
  onOpen?: (() => void) | undefined;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const done = todo.state === "done";
  return (
    <div className="todo-row" data-done={done || undefined} data-late={late || undefined}>
      <TodoCircle
        done={done}
        late={late}
        label={t("todo-check", { title: todo.title })}
        onClick={onToggle}
      />
      <button type="button" className="todo-row__text" disabled={!onOpen} onClick={onOpen}>
        <b>{todo.title}</b>
        {(line || repeat) && (
          <small>
            {line}
            {repeat && (
              <span className="todo-row__repeat">{t("todo-repeat-mark", { repeat })}</span>
            )}
          </small>
        )}
      </button>
      {children}
    </div>
  );
}

function Chip({ text, on, onClick }: { text: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="schedule-chip"
      data-on={on || undefined}
      aria-pressed={on}
      onClick={onClick}
    >
      {text}
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="schedule-edit__field">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

function daysOf(text: string): number[] {
  return [
    ...new Set(
      text
        .split(/[^0-9]+/)
        .map(Number)
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 31),
    ),
  ].sort((a, b) => a - b);
}

type RepeatKind = "none" | TodoRepeat["kind"];

export function TodoEditor({
  todo,
  onDone,
  onDeleted,
}: {
  todo: Todo;
  onDone: () => void;
  onDeleted?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const store = useHub();
  const [title, setTitle] = useState(todo.title);
  const [date, setDate] = useState(todo.date ?? "");
  const [time, setTime] = useState(todo.minute === null ? "" : minuteText(todo.minute));
  const [kind, setKind] = useState<RepeatKind>(todo.repeat?.kind ?? "none");
  const [weekdays, setWeekdays] = useState<number[]>(
    todo.repeat?.kind === "weekly" ? todo.repeat.weekdays : [],
  );
  const [days, setDays] = useState(
    todo.repeat?.kind === "monthly" ? todo.repeat.days.join(", ") : "",
  );
  const [note, setNote] = useState(todo.note);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const cleanDate = date.trim();
    if (cleanDate && !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      setProblem(t("todo-edit-bad-date"));
      return;
    }
    const minute = time.trim() ? parseMinute(time) : null;
    if (time.trim() && minute === null) {
      setProblem(t("todo-edit-bad-time"));
      return;
    }
    const repeat: TodoRepeat | null =
      kind === "daily"
        ? { kind: "daily" }
        : kind === "weekly" && weekdays.length > 0
          ? { kind: "weekly", weekdays: [...weekdays].sort((a, b) => a - b) }
          : kind === "monthly" && daysOf(days).length > 0
            ? { kind: "monthly", days: daysOf(days) }
            : null;
    setBusy(true);
    try {
      await store.updateTodo({
        ...todo,
        title: title.trim() || todo.title,
        date: cleanDate || null,
        minute,
        repeat,
        note: note.trim(),
      });
      onDone();
    } catch {
      setProblem(t("todo-action-failed"));
    } finally {
      setBusy(false);
    }
  };

  const source = [t(TODO_SOURCE_KEYS[todo.source.kind]), todo.source.detail]
    .filter(Boolean)
    .join(t("todo-dot"));

  return (
    <div className="schedule-edit todo-edit">
      <Field label={t("todo-edit-name")}>
        <input
          className="schedule-edit__input"
          value={title}
          aria-label={t("todo-edit-name")}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <Field label={t("todo-edit-date")}>
        <input
          type="date"
          className="schedule-edit__input schedule-edit__time"
          value={date}
          aria-label={t("todo-edit-date")}
          onChange={(event) => setDate(event.target.value)}
        />
        <input
          className="schedule-edit__input schedule-edit__time"
          value={time}
          placeholder={t("todo-edit-time-hint")}
          aria-label={t("todo-edit-time")}
          onChange={(event) => setTime(event.target.value)}
        />
      </Field>
      <Field label={t("todo-edit-repeat")}>
        <Chip text={t("todo-repeat-none")} on={kind === "none"} onClick={() => setKind("none")} />
        <Chip
          text={t("todo-repeat-daily")}
          on={kind === "daily"}
          onClick={() => setKind("daily")}
        />
        <Chip
          text={t("todo-repeat-weekly-option")}
          on={kind === "weekly"}
          onClick={() => setKind("weekly")}
        />
        <Chip
          text={t("todo-repeat-monthly-option")}
          on={kind === "monthly"}
          onClick={() => setKind("monthly")}
        />
      </Field>
      {kind === "weekly" && (
        <Field label={t("todo-edit-weekdays")}>
          {SCHEDULE_WEEKDAYS.map((key, index) => {
            const value = index + 1;
            const on = weekdays.includes(value);
            return (
              <Chip
                key={key}
                text={t(key)}
                on={on}
                onClick={() =>
                  setWeekdays(on ? weekdays.filter((item) => item !== value) : [...weekdays, value])
                }
              />
            );
          })}
        </Field>
      )}
      {kind === "monthly" && (
        <Field label={t("todo-edit-days")}>
          <input
            className="schedule-edit__input"
            value={days}
            placeholder={t("todo-edit-days-hint")}
            aria-label={t("todo-edit-days")}
            onChange={(event) => setDays(event.target.value)}
          />
        </Field>
      )}
      <Field label={t("todo-edit-note")}>
        <textarea
          className="schedule-edit__input schedule-edit__area"
          value={note}
          aria-label={t("todo-edit-note")}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      {source && (
        <Field label={t("todo-edit-source")}>
          <span className="todo-edit__source">{source}</span>
        </Field>
      )}
      {problem && <p className="schedule-card__invalid">{problem}</p>}
      <div className="schedule-card__buttons">
        <button
          type="button"
          className="button button--dark"
          disabled={busy}
          onClick={() => void save()}
        >
          {t("todo-save")}
        </button>
        <button type="button" className="button button--line" onClick={onDone}>
          {t("todo-cancel")}
        </button>
        {onDeleted && (
          <button
            type="button"
            className="ws-settings__danger"
            onClick={() => {
              onDeleted();
              void store.deleteTodo(todo.id).catch(() => setProblem(t("todo-action-failed")));
            }}
          >
            {t("todo-delete")}
          </button>
        )}
      </div>
    </div>
  );
}
