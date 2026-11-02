import { todoCardIds, todoDailyLine, todoProposalLine } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Todo } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useHubStore } from "../hub/HubProvider.tsx";
import { PairButtons } from "../schedule/ScheduleCard.tsx";
import { ButtonPair, TodoCircle, TodoEditor, TodoRow } from "./TodoBits.tsx";

function Proposal({ todos, onEdit }: { todos: Todo[]; onEdit: (todo: Todo) => void }) {
  const { t } = useI18n();
  const store = useHubStore();
  const [busy, setBusy] = useState(false);
  const waiting = todos.filter((todo) => todo.state === "proposed");
  const confirm = async () => {
    setBusy(true);
    try {
      for (const todo of waiting) await store.confirmTodo(todo.id);
    } catch {
      Alert.alert(t("todo-action-failed"));
    } finally {
      setBusy(false);
    }
  };
  const single = todos.length === 1 ? todos[0] : undefined;
  return (
    <View style={styles.card}>
      {single ? (
        <>
          <View style={styles.head}>
            <TodoCircle done={single.state === "done"} label={t("todo-check", { title: single.title })} />
            <Text style={styles.headTitle}>{single.title}</Text>
          </View>
          <Text style={styles.sub}>{todoProposalLine(t, single)}</Text>
        </>
      ) : (
        <View>
          {todos.map((todo, index) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              first={index === 0}
              line={todoProposalLine(t, todo)}
              onPress={() => onEdit(todo)}
            />
          ))}
        </View>
      )}
      {waiting.length > 0 ? (
        <PairButtons
          solid={t("todo-ok")}
          line={t("todo-change")}
          busy={busy}
          onSolid={() => void confirm()}
          onLine={() => {
            const first = waiting[0];
            if (first) onEdit(first);
          }}
        />
      ) : (
        <Text style={styles.done}>{t("todo-confirmed")}</Text>
      )}
    </View>
  );
}

function Added({
  todos,
  missing,
  onEdit,
}: {
  todos: Todo[];
  missing: boolean;
  onEdit: (todo: Todo) => void;
}) {
  const { t } = useI18n();
  const store = useHubStore();
  const [busy, setBusy] = useState(false);
  const open = todos.filter((todo) => todo.state === "open");
  const shop = open.filter((todo) => todo.shopItem !== null);
  const moved = todos.length > 0 && todos.every((todo) => todo.state === "shopping");
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } catch {
      Alert.alert(t("todo-action-failed"));
    } finally {
      setBusy(false);
    }
  };
  const ids = (list: Todo[]) => list.map((todo) => todo.id);
  const toggle = (todo: Todo) =>
    void store
      .todoAction(todo.id, todo.state === "done" ? "reopen" : "done")
      .catch(() => Alert.alert(t("todo-action-failed")));
  const rows = todos.filter((todo) => todo.state !== "shopping");
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{t("todo-added")}</Text>
      {rows.length > 0 ? (
        <View>
          {rows.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              line={todoDailyLine(t, todo)}
              onToggle={() => toggle(todo)}
              onPress={() => onEdit(todo)}
            />
          ))}
        </View>
      ) : null}
      {moved ? (
        <Text style={styles.done}>{t("todo-moved-shopping")}</Text>
      ) : missing && todos.length === 0 ? (
        <Text style={styles.muted}>{t("todo-undone")}</Text>
      ) : shop.length > 0 ? (
        <ButtonPair
          line={t("todo-to-shopping")}
          solid={t("todo-keep")}
          busy={busy}
          onLine={() => void run(() => store.todosToShopping(ids(shop)))}
          onSolid={() => void run(() => store.keepTodos(ids(shop)))}
        />
      ) : open.length > 0 ? (
        <Pressable
          style={styles.undo}
          accessibilityRole="button"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              for (const todo of open) await store.deleteTodo(todo.id);
            })
          }
        >
          <Text style={styles.undoText}>{t("todo-undo")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function TodoCard({ todoIds }: { todoIds: string[] }) {
  const store = useHubStore();
  const { todos, todosLoaded, status } = useHubState(store);
  const [editing, setEditing] = useState<Todo | null>(null);
  const found = todoCardIds(todos, todoIds);
  const missing = found.length < todoIds.length;

  useEffect(() => {
    if (status === "open" && missing && !todosLoaded) {
      void store.listTodos().catch(() => undefined);
    }
  }, [status, missing, todosLoaded, store]);

  const proposed = found.filter((todo) => todo.date !== null || todo.repeat !== null);
  const untimed = found.filter((todo) => !proposed.includes(todo));
  const current = editing ? (todos[editing.id] ?? editing) : null;
  return (
    <View style={styles.stack}>
      {proposed.length > 0 ? <Proposal todos={proposed} onEdit={setEditing} /> : null}
      {untimed.length > 0 || (missing && todosLoaded && proposed.length === 0) ? (
        <Added todos={untimed} missing={missing && todosLoaded} onEdit={setEditing} />
      ) : null}
      <TodoEditor todo={current} onClose={() => setEditing(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10, marginTop: 4 },
  card: {
    width: 300,
    maxWidth: "100%",
    backgroundColor: color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.line,
    padding: 12,
    gap: 10,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  headTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: color.ink },
  sub: { fontSize: 13, color: color.muted },
  label: { fontSize: 12, color: color.faded },
  done: { fontSize: 13, color: color.success },
  muted: { fontSize: 13, color: color.faded },
  undo: { alignSelf: "flex-start", paddingVertical: 2 },
  undoText: { fontSize: 13, color: color.accent },
});
