import {
  TODO_GROUP_KEYS,
  TODO_GROUP_ORDER,
  todoBucket,
  todoDailyLine,
  todoGroups,
  todoPageLine,
  todoSummary,
} from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Todo } from "@xiaoban/protocol";
import { useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { dismiss, dismissOnCancel } from "../../lib/dialog.ts";
import { TodoEditor, TodoRow } from "./TodoBits.tsx";

const MAX_DONE = 30;

function useToggle() {
  const store = useHub();
  return (todo: Todo) =>
    void store
      .todoAction(todo.id, todo.state === "done" ? "reopen" : "done")
      .catch(() => undefined);
}

export function TodoDailyCard({ onOpenAll }: { onOpenAll: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const { dailyFeed, todos: known } = useHubState(store);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const toggle = useToggle();
  const todos = (dailyFeed?.todos ?? []).map((todo) => known[todo.id] ?? todo);
  const now = Date.now();

  const add = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await store.quickAddTodo(value);
      setText("");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="life-card todo-daily">
      <div className="life-card__head">
        <b>{t("todo-title")}</b>
        <span className="life-card__note">{todoSummary(t, todos, now)}</span>
        <span className="life-card__spacer" />
        <button type="button" className="code-link" onClick={onOpenAll}>
          {t("todo-all")}
        </button>
      </div>
      {todos.length > 0 && (
        <div className="todo-daily__rows">
          {todos.map((todo) =>
            editing === todo.id ? (
              <TodoEditor
                key={todo.id}
                todo={todo}
                onDone={() => setEditing(null)}
                onDeleted={() => setEditing(null)}
              />
            ) : (
              <TodoRow
                key={todo.id}
                todo={todo}
                late={todoBucket(todo, now) === "overdue"}
                line={todoDailyLine(t, todo, now)}
                onToggle={() => toggle(todo)}
                onOpen={() => setEditing(todo.id)}
              />
            ),
          )}
        </div>
      )}
      <input
        className="todo-daily__add"
        value={text}
        disabled={busy}
        placeholder={t("todo-add-hint")}
        aria-label={t("todo-add-hint")}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) void add();
        }}
      />
      {failed && <p className="schedule-card__invalid">{t("todo-add-failed")}</p>}
    </section>
  );
}

export function TodosDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const { todos } = useHubState(store);
  const dialog = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const toggle = useToggle();

  useEffect(() => {
    dialog.current?.showModal();
    void store.listTodos().catch(() => undefined);
  }, [store]);

  const now = Date.now();
  const groups = todoGroups(Object.values(todos), now);
  groups.done = groups.done.slice(0, MAX_DONE);
  const empty = TODO_GROUP_ORDER.every((key) => groups[key].length === 0);

  return (
    <dialog
      ref={dialog}
      onCancel={dismissOnCancel}
      onClose={onClose}
      className="dialog ws-settings todos"
      aria-labelledby="todos-title"
    >
      <div className="ws-settings__head">
        <h2 id="todos-title" className="dialog__title">
          {t("todo-title")}
        </h2>
        <button
          type="button"
          className="dialog__close"
          aria-label={t("todo-close")}
          onClick={() => dismiss(dialog.current)}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M7 7l10 10M17 7L7 17" />
          </svg>
        </button>
      </div>
      <section className="ws-settings__section">
        {empty && <p className="ws-settings__none">{t("todo-empty")}</p>}
        {TODO_GROUP_ORDER.map((key) =>
          groups[key].length === 0 ? null : (
            <div key={key} className="todos__group">
              <span className="todos__label">{t(TODO_GROUP_KEYS[key])}</span>
              <div className="todos__list">
                {groups[key].map((todo) => {
                  if (editing === todo.id) {
                    return (
                      <TodoEditor
                        key={todo.id}
                        todo={todo}
                        onDone={() => setEditing(null)}
                        onDeleted={() => setEditing(null)}
                      />
                    );
                  }
                  const line = todoPageLine(t, todo, now);
                  return (
                    <TodoRow
                      key={todo.id}
                      todo={todo}
                      late={key === "overdue"}
                      line={line.text}
                      repeat={line.repeat}
                      onToggle={() => toggle(todo)}
                      onOpen={() => setEditing(todo.id)}
                    >
                      <button
                        type="button"
                        className="todos__delete"
                        onClick={() => void store.deleteTodo(todo.id).catch(() => undefined)}
                      >
                        {t("todo-delete")}
                      </button>
                    </TodoRow>
                  );
                })}
              </div>
            </div>
          ),
        )}
        <p className="ws-settings__hint">{t("todo-page-hint-desktop")}</p>
      </section>
    </dialog>
  );
}
