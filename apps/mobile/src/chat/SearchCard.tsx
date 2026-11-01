import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import * as Linking from "expo-linking";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useHubStore } from "../hub/HubProvider.tsx";
import { OutIcon } from "../trip/TripIcons.tsx";
import { Icon } from "../ui/Icon.tsx";

const PLATFORM = "https://platform.deepseek.com/api_keys";

type Phase = "idle" | "verifying" | "invalid" | "offline" | "connected" | "skipped";

export function SearchCard({ threadId, answered }: { threadId: string; answered: boolean }) {
  const { t } = useI18n();
  const store = useHubStore();
  const { services } = useHubState(store);
  const connected = services.some((status) => status.service === "web_search" && status.connected);
  const [phase, setPhase] = useState<Phase>(
    connected ? "connected" : answered ? "skipped" : "idle",
  );
  const [key, setKey] = useState("");

  const save = async () => {
    if (!key.trim() || phase === "verifying") return;
    setPhase("verifying");
    try {
      setPhase((await store.configureSearch(key.trim(), threadId)) ? "connected" : "invalid");
    } catch {
      setPhase("offline");
    }
  };
  const skip = () => {
    setPhase("skipped");
    void store.declineSearch(threadId).catch(() => undefined);
  };

  if (phase === "connected" || phase === "skipped") {
    const done = phase === "connected";
    return (
      <View style={[styles.card, styles.row, !done && styles.faded]}>
        {done ? <Icon name="check" size={18} color={color.success} /> : null}
        <View style={styles.flex}>
          <Text style={[styles.title, done && { color: color.success }]}>
            {t(done ? "search-card-connected" : "search-card-skipped")}
          </Text>
          <Text style={styles.hint}>
            {t(done ? "search-card-resuming" : "search-card-skipped-hint")}
          </Text>
        </View>
      </View>
    );
  }

  const verifying = phase === "verifying";
  const failed = phase === "invalid" || phase === "offline";
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("search-card-title")}</Text>
      <Text style={styles.hint}>{t("search-card-subtitle")}</Text>
      <Text style={styles.hint}>
        {t("search-card-step-1", { platform: t("search-card-platform") })}
      </Text>
      <Pressable
        style={styles.link}
        accessibilityRole="link"
        onPress={() => void Linking.openURL(PLATFORM).catch(() => undefined)}
      >
        <Text style={styles.linkText}>{t("search-card-platform")}</Text>
        <OutIcon color={color.accent} />
      </Pressable>
      <Text style={styles.hint}>{t("search-card-step-2")}</Text>
      <View style={styles.row}>
        <TextInput
          style={[styles.input, failed && { borderColor: color.dangerInk }]}
          value={key}
          editable={!verifying}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t("search-card-key")}
          placeholder={t("search-card-placeholder")}
          placeholderTextColor={color.faint}
          onChangeText={(value) => {
            setKey(value);
            if (failed) setPhase("idle");
          }}
          onSubmitEditing={() => void save()}
        />
        <Pressable
          style={[styles.save, (verifying || !key.trim()) && styles.faded]}
          disabled={verifying || !key.trim()}
          accessibilityRole="button"
          onPress={() => void save()}
        >
          {verifying ? <ActivityIndicator size="small" color={color.surface} /> : null}
          <Text style={styles.saveText}>
            {t(verifying ? "search-card-verifying" : "search-card-save")}
          </Text>
        </Pressable>
      </View>
      {failed ? (
        <Text style={styles.error} accessibilityRole="alert">
          {t(phase === "invalid" ? "search-card-invalid" : "search-card-offline")}
        </Text>
      ) : null}
      <Pressable hitSlop={8} disabled={verifying} accessibilityRole="button" onPress={skip}>
        <Text style={styles.skip}>{t("search-card-skip")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 8,
    minWidth: 260,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  faded: { opacity: 0.6 },
  title: { fontSize: 14, fontWeight: "700", color: color.ink },
  hint: { fontSize: 12, lineHeight: 18, color: color.muted },
  link: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  linkText: { fontSize: 13, color: color.accent },
  input: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: color.lineStrong,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: color.ink,
  },
  save: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: color.ink,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  saveText: { fontSize: 13, color: color.surface, fontWeight: "500" },
  error: { fontSize: 12, color: color.dangerInk },
  skip: { fontSize: 12, color: color.inkMid },
});
