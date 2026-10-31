import { describeError } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import { color, space } from "@xiaoban/tokens";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useHubContext } from "../src/hub/HubProvider.tsx";
import { shared } from "../src/theme.ts";

export default function PairScreen() {
  const { t } = useI18n();
  const { pair } = useHubContext();
  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await pair(address, code);
      router.replace("/");
    } catch (cause) {
      setError(t(describeError(cause)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[shared.screen, styles.body]}>
      <Text style={styles.lead}>{t("pair-lead")}</Text>
      <TextInput
        style={shared.input}
        placeholder={t("pair-address-placeholder")}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        value={address}
        onChangeText={setAddress}
      />
      <TextInput
        style={shared.input}
        placeholder={t("pair-code-placeholder")}
        keyboardType="number-pad"
        maxLength={6}
        value={code}
        onChangeText={setCode}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[shared.primaryButton, busy && styles.disabled]}
        disabled={busy || !address || code.length !== 6}
        onPress={submit}
        accessibilityRole="button"
      >
        <Text style={shared.primaryButtonText}>{t(busy ? "pair-submitting" : "pair-submit")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: space.lg,
    gap: space.md,
  },
  lead: {
    fontSize: 14,
    lineHeight: 22,
    color: color.inkSoft,
  },
  error: {
    color: color.attentionInk,
    fontSize: 13,
  },
  disabled: {
    opacity: 0.5,
  },
});
