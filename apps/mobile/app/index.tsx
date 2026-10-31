import type { HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Thread } from "@xiaoban/protocol";
import { color, space } from "@xiaoban/tokens";
import { Redirect, router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useHubContext } from "../src/hub/HubProvider.tsx";
import { shared } from "../src/theme.ts";

export default function HomeScreen() {
  const { phase, store } = useHubContext();
  if (phase === "loading") return <View style={shared.screen} />;
  if (phase === "unpaired" || !store) return <Redirect href="/pair" />;
  return <ThreadList store={store} />;
}

function ThreadList({ store }: { store: HubStore }) {
  const { t } = useI18n();
  const { threads, status } = useHubState(store);

  const create = async () => {
    const thread = await store.createThread();
    router.push({ pathname: "/thread/[id]", params: { id: thread.id } });
  };

  return (
    <View style={shared.screen}>
      {status !== "open" && <Text style={styles.status}>{t("connection-waiting-for-hub")}</Text>}
      <FlatList<Thread>
        data={threads}
        keyExtractor={(thread) => thread.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            accessibilityRole="button"
            onPress={() => router.push({ pathname: "/thread/[id]", params: { id: item.id } })}
          >
            <Text style={styles.title}>{item.title ?? t("thread-untitled")}</Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.empty}>{t("thread-empty")}</Text>}
      />
      <Pressable
        style={[shared.primaryButton, styles.fab]}
        onPress={create}
        accessibilityRole="button"
      >
        <Text style={shared.primaryButtonText}>{t("thread-new")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  status: {
    textAlign: "center",
    fontSize: 12,
    color: color.attentionInk,
    paddingVertical: space.sm,
  },
  list: {
    padding: space.lg,
    gap: space.sm,
  },
  row: {
    backgroundColor: color.surface,
    borderRadius: 14,
    padding: space.lg,
  },
  title: {
    fontSize: 15,
    color: color.ink,
  },
  empty: {
    textAlign: "center",
    color: color.muted,
    marginTop: 80,
  },
  fab: {
    margin: space.lg,
  },
});
