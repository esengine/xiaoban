import { TODO_GROUP_KEYS, TODO_GROUP_ORDER, todoGroups, todoPageLine } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Todo } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHubStore } from "../src/hub/HubProvider.tsx";
import { LifeHeader, SwipeRow } from "../src/life/LifeUI.tsx";
import { TodoEditor, TodoRow } from "../src/todo/TodoBits.tsx";

const MAX_DONE = 30;

export default function TodosScreen() {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const store = useHubStore();
  const { todos, status } = useHubState(store);
  const [editing, setEditing] = useState<Todo | null>(null);

  useEffect(() => {
    if (status === "open") void store.listTodos().catch(() => undefined);
  }, [status, store]);

  const now = Date.now();
  const groups = todoGroups(Object.values(todos), now);
  groups.done = groups.done.slice(0, MAX_DONE);
  const empty = TODO_GROUP_ORDER.every((key) => groups[key].length === 0);
  const fail = () => Alert.alert(t("todo-action-failed"));

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <LifeHeader title={t("todo-title")} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 24 + insets.bottom }]}>
        {empty ? (
          <View style={styles.card}>
            <Text style={styles.empty}>{t("todo-empty")}</Text>
          </View>
        ) : null}
        {TODO_GROUP_ORDER.map((key) =>
          groups[key].length === 0 ? null : (
            <View key={key}>
              <Text style={styles.group}>{t(TODO_GROUP_KEYS[key])}</Text>
              <View style={styles.card}>
                {groups[key].map((todo, index) => {
                  const line = todoPageLine(t, todo, now);
                  return (
                    <SwipeRow
                      key={todo.id}
                      action={t("todo-delete")}
                      actionColor={color.dangerInk}
                      width={72}
                      onAction={() => void store.deleteTodo(todo.id).catch(fail)}
                    >
                      <View style={styles.rowPad}>
                        <TodoRow
                          todo={todo}
                          first={index === 0}
                          overdue={key === "overdue"}
                          line={line.text}
                          repeat={line.repeat}
                          onToggle={() =>
                            void store
                              .todoAction(todo.id, todo.state === "done" ? "reopen" : "done")
                              .catch(fail)
                          }
                          onPress={() => setEditing(todo)}
                        />
                      </View>
                    </SwipeRow>
                  );
                })}
              </View>
            </View>
          ),
        )}
        <Text style={styles.hint}>{t("todo-page-hint")}</Text>
      </ScrollView>
      <TodoEditor
        todo={editing ? (todos[editing.id] ?? null) : null}
        onClose={() => setEditing(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  body: { paddingHorizontal: 14 },
  group: { fontSize: 12, color: color.faded, marginTop: 14, marginBottom: 4, marginHorizontal: 4 },
  card: { backgroundColor: color.surface, borderRadius: 14, overflow: "hidden" },
  rowPad: { paddingHorizontal: 14 },
  empty: { fontSize: 13, color: color.muted, padding: 16, lineHeight: 19 },
  hint: { fontSize: 12, color: color.faded, marginVertical: 12, marginHorizontal: 4 },
});
