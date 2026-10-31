import { failureKey } from "@xiaoban/client";
import { draftsForThread, useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { color, radius, space } from "@xiaoban/tokens";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useHubStore } from "../../src/hub/HubProvider.tsx";
import { shared } from "../../src/theme.ts";

interface Row {
  key: string;
  role: "user" | "assistant";
  text: string;
  pending: boolean;
}

export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const store = useHubStore();
  const state = useHubState(store);
  const [text, setText] = useState("");

  useEffect(() => {
    if (state.status === "open") void store.loadMessages(id);
  }, [id, state.status, store]);

  const rows: Row[] = [
    ...(state.messages[id] ?? []).map((message) => ({
      key: message.id,
      role: message.role,
      text: message.text,
      pending: false,
    })),
    ...draftsForThread(state, id).map((draft) => ({
      key: draft.turnId,
      role: "assistant" as const,
      text: draft.failure
        ? t("draft-failed", { reason: t(failureKey(draft.failure.kind)) })
        : draft.text || t("draft-thinking"),
      pending: !draft.failure,
    })),
  ];
  const title = state.threads.find((thread) => thread.id === id)?.title ?? t("thread-untitled");

  const send = async () => {
    const value = text.trim();
    if (!value) return;
    setText("");
    await store.send(id, value);
  };

  return (
    <KeyboardAvoidingView style={shared.screen} behavior="padding">
      <Stack.Screen options={{ title }} />
      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === "user" ? styles.user : styles.assistant]}>
            <Text
              style={[
                styles.text,
                item.role === "user" && styles.userText,
                item.pending && styles.pending,
              ]}
            >
              {item.text}
            </Text>
          </View>
        )}
      />
      <View style={styles.composer}>
        <TextInput
          style={[shared.input, styles.field]}
          placeholder={t("composer-placeholder")}
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          returnKeyType="send"
        />
        <Pressable style={shared.primaryButton} onPress={send} accessibilityRole="button">
          <Text style={shared.primaryButtonText}>{t("composer-send")}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: space.lg,
    gap: space.md,
  },
  bubble: {
    maxWidth: "80%",
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  user: {
    alignSelf: "flex-end",
    backgroundColor: color.accent,
    borderRadius: radius.bubble,
    borderBottomRightRadius: 4,
  },
  assistant: {
    alignSelf: "flex-start",
    backgroundColor: color.surface,
    borderRadius: radius.bubble,
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
    color: color.ink,
  },
  userText: {
    color: color.surface,
  },
  pending: {
    color: color.muted,
  },
  composer: {
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
    paddingBottom: space.xl,
    backgroundColor: color.surface,
  },
  field: {
    flex: 1,
    backgroundColor: color.ground,
  },
});
