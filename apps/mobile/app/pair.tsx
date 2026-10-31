import { color, space } from "@xiaoban/tokens";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useHubContext } from "../src/hub/HubProvider.tsx";
import { shared } from "../src/theme.ts";

export default function PairScreen() {
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
      setError(cause instanceof Error ? cause.message : "连接失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[shared.screen, styles.body]}>
      <Text style={styles.lead}>
        在电脑上打开小伴 › 设置 › 设备，把显示的地址和配对码填在这里。
      </Text>
      <TextInput
        style={shared.input}
        placeholder="电脑地址，比如 192.168.1.8"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        value={address}
        onChangeText={setAddress}
      />
      <TextInput
        style={shared.input}
        placeholder="6 位配对码"
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
        <Text style={shared.primaryButtonText}>{busy ? "连接中…" : "连接"}</Text>
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
