import type { HubStore } from "@xiaoban/client";
import { todoBucket, todoDailyLine, todoSummary } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Todo } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { TodoEditor, TodoRow } from "./TodoBits.tsx";

export function TodoDailyCard({ store }: { store: HubStore }) {
  const { t } = useI18n();
  const { dailyFeed, todos: known } = useHubState(store);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const todos = (dailyFeed?.todos ?? []).map((todo) => known[todo.id] ?? todo);
  const now = Date.now();

  const add = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await store.quickAddTodo(value);
      setText("");
    } catch {
      Alert.alert(t("todo-add-failed"));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (todo: Todo) =>
    void store
      .todoAction(todo.id, todo.state === "done" ? "reopen" : "done")
      .catch(() => Alert.alert(t("todo-action-failed")));

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{t("todo-title")}</Text>
        <Text style={styles.summary}>{todoSummary(t, todos, now)}</Text>
        <View style={styles.flex} />
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("todo-open")}
          onPress={() => router.push("/todos")}
        >
          <Text style={styles.all}>{t("todo-all")}</Text>
        </Pressable>
      </View>
      {todos.length > 0 ? (
        <View>
          {todos.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              overdue={todoBucket(todo, now) === "overdue"}
              line={todoDailyLine(t, todo, now)}
              onToggle={() => toggle(todo)}
              onPress={() => setEditing(todo)}
            />
          ))}
        </View>
      ) : null}
      <TextInput
        style={styles.input}
        value={text}
        editable={!busy}
        placeholder={t("todo-add-hint")}
        placeholderTextColor={color.faded}
        returnKeyType="done"
        onChangeText={setText}
        onSubmitEditing={() => void add()}
      />
      <TodoEditor
        todo={editing ? (known[editing.id] ?? editing) : null}
        onClose={() => setEditing(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.line,
    padding: 14,
    gap: 10,
  },
  head: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  title: { fontSize: 16, fontWeight: "700", color: color.ink },
  summary: { fontSize: 12, color: color.muted },
  flex: { flex: 1 },
  all: { fontSize: 12, color: color.accent },
  input: {
    height: 40,
    borderRadius: 10,
    backgroundColor: color.ground,
    paddingHorizontal: 12,
    fontSize: 13,
    color: color.ink,
  },
});
