import { todoCardIds, todoDailyLine, todoProposalLine } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Todo } from "@xiaoban/protocol";
import { useEffect, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { TodoCircle, TodoEditor, TodoRow } from "./TodoBits.tsx";

function useRun() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setFailed(null);
    try {
      await work();
    } catch {
      setFailed(t("todo-action-failed"));
    } finally {
      setBusy(false);
    }
  };
  return { busy, failed, run };
}

function Proposal({ todos }: { todos: Todo[] }) {
  const { t } = useI18n();
  const store = useHub();
  const { busy, failed, run } = useRun();
  const [editing, setEditing] = useState<Todo | null>(null);
  const waiting = todos.filter((todo) => todo.state === "proposed");
  const single = todos.length === 1 ? todos[0] : undefined;
  if (editing) {
    return (
      <div className="todo-card">
        <TodoEditor todo={editing} onDone={() => setEditing(null)} />
      </div>
    );
  }
  return (
    <div className="todo-card">
      {single ? (
        <>
          <div className="todo-card__head">
            <TodoCircle
              done={single.state === "done"}
              label={t("todo-check", { title: single.title })}
            />
            <b>{single.title}</b>
          </div>
          <p className="todo-card__sub">{todoProposalLine(t, single)}</p>
        </>
      ) : (
        <div className="todo-card__rows">
          {todos.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              line={todoProposalLine(t, todo)}
              onOpen={() => setEditing(todo)}
            />
          ))}
        </div>
      )}
      {failed && <p className="schedule-card__invalid">{failed}</p>}
      {waiting.length > 0 ? (
        <div className="schedule-card__buttons">
          <button
            type="button"
            className="button button--dark"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                for (const todo of waiting) await store.confirmTodo(todo.id);
              })
            }
          >
            {t("todo-ok")}
          </button>
          <button
            type="button"
            className="button button--line"
            onClick={() => {
              const first = waiting[0];
              if (first) setEditing(first);
            }}
          >
            {t("todo-change")}
          </button>
        </div>
      ) : (
        <p className="todo-card__done">{t("todo-confirmed")}</p>
      )}
    </div>
  );
}

function Added({ todos, missing }: { todos: Todo[]; missing: boolean }) {
  const { t } = useI18n();
  const store = useHub();
  const { busy, failed, run } = useRun();
  const [editing, setEditing] = useState<Todo | null>(null);
  const open = todos.filter((todo) => todo.state === "open");
  const shop = open.filter((todo) => todo.shopItem !== null);
  const moved = todos.length > 0 && todos.every((todo) => todo.state === "shopping");
  const rows = todos.filter((todo) => todo.state !== "shopping");
  const ids = (list: Todo[]) => list.map((todo) => todo.id);
  return (
    <div className="todo-card">
      <span className="todo-card__label">{t("todo-added")}</span>
      {rows.length > 0 && (
        <div className="todo-card__rows">
          {rows.map((todo) =>
            editing?.id === todo.id ? (
              <TodoEditor key={todo.id} todo={todo} onDone={() => setEditing(null)} />
            ) : (
              <TodoRow
                key={todo.id}
                todo={todo}
                line={todoDailyLine(t, todo)}
                onToggle={() =>
                  void run(() =>
                    store.todoAction(todo.id, todo.state === "done" ? "reopen" : "done"),
                  )
                }
                onOpen={() => setEditing(todo)}
              />
            ),
          )}
        </div>
      )}
      {failed && <p className="schedule-card__invalid">{failed}</p>}
      {moved ? (
        <p className="todo-card__done">{t("todo-moved-shopping")}</p>
      ) : missing && todos.length === 0 ? (
        <p className="todo-card__muted">{t("todo-undone")}</p>
      ) : shop.length > 0 ? (
        <div className="schedule-card__buttons">
          <button
            type="button"
            className="button button--line"
            disabled={busy}
            onClick={() => void run(() => store.todosToShopping(ids(shop)))}
          >
            {t("todo-to-shopping")}
          </button>
          <button
            type="button"
            className="button button--dark"
            disabled={busy}
            onClick={() => void run(() => store.keepTodos(ids(shop)))}
          >
            {t("todo-keep")}
          </button>
        </div>
      ) : open.length > 0 ? (
        <button
          type="button"
          className="code-link todo-card__undo"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              for (const todo of open) await store.deleteTodo(todo.id);
            })
          }
        >
          {t("todo-undo")}
        </button>
      ) : null}
    </div>
  );
}

export function TodoCard({ todoIds }: { todoIds: string[] }) {
  const store = useHub();
  const { todos, todosLoaded, status } = useHubState(store);
  const found = todoCardIds(todos, todoIds);
  const missing = found.length < todoIds.length;

  useEffect(() => {
    if (status === "open" && missing && !todosLoaded) {
      void store.listTodos().catch(() => undefined);
    }
  }, [status, missing, todosLoaded, store]);

  const proposed = found.filter((todo) => todo.date !== null || todo.repeat !== null);
  const untimed = found.filter((todo) => !proposed.includes(todo));
  return (
    <div className="todo-cards">
      {proposed.length > 0 && <Proposal todos={proposed} />}
      {(untimed.length > 0 || (missing && todosLoaded && proposed.length === 0)) && (
        <Added todos={untimed} missing={missing && todosLoaded} />
      )}
    </div>
  );
}
