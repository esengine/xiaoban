import { MAIL_FAILURE_KEYS, MAIL_SECRET, mailProvider } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { MailStatus } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useHubContext, useHubStore } from "../src/hub/HubProvider.tsx";
import { MailScreen, mailStyles } from "../src/mail/MailScreen.tsx";

type Field = "address" | "password" | "host";

export default function MailConnectScreen() {
  const { t } = useI18n();
  const store = useHubStore();
  const { namedSaved } = useHubContext();
  const params = useLocalSearchParams<{ provider?: string }>();
  const provider = mailProvider(params.provider);
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState("");
  const [focus, setFocus] = useState<Field | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MailStatus | null>(null);
  const other = provider.id === "other";
  const ready =
    address.includes("@") && password.trim().length > 0 && (!other || host.trim().length > 0);
  const done = result?.connected === true;

  const connect = async () => {
    if (busy || !ready) return;
    setBusy(true);
    try {
      const status = await store.connectMail(
        provider.id,
        address.trim(),
        password,
        other ? host.trim() : null,
      );
      setResult(status);
      if (status.connected) await namedSaved(MAIL_SECRET, password.replace(/\s+/g, ""));
    } catch {
      setResult({
        connected: false,
        provider: null,
        address: null,
        total: 0,
        checkedAt: null,
        syncing: false,
        failure: "unreachable",
      });
    } finally {
      setBusy(false);
    }
  };

  const input = (field: Field) => [styles.input, focus === field && styles.inputFocus];

  return (
    <MailScreen title={t("mail-connect-title")}>
      <View style={mailStyles.card}>
        <Text style={mailStyles.cardTitle}>{t(provider.name)}</Text>
        <Text style={mailStyles.label}>{t("mail-address")}</Text>
        <TextInput
          style={input("address")}
          value={address}
          onChangeText={setAddress}
          onFocus={() => setFocus("address")}
          onBlur={() => setFocus(null)}
          placeholder={t("mail-address-placeholder")}
          placeholderTextColor={color.faded}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          editable={!done}
        />
        {other && (
          <>
            <Text style={mailStyles.label}>{t("mail-host")}</Text>
            <TextInput
              style={input("host")}
              value={host}
              onChangeText={setHost}
              onFocus={() => setFocus("host")}
              onBlur={() => setFocus(null)}
              placeholder={t("mail-host-placeholder")}
              placeholderTextColor={color.faded}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!done}
            />
          </>
        )}
        <Text style={mailStyles.label}>{t(provider.password)}</Text>
        <TextInput
          style={[input("password"), styles.secret]}
          value={password}
          onChangeText={setPassword}
          onFocus={() => setFocus("password")}
          onBlur={() => setFocus(null)}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          editable={!done}
          returnKeyType="go"
          onSubmitEditing={() => void connect()}
        />
        {provider.url ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(provider.url ?? "").catch(() => undefined)}
          >
            <Text style={styles.help}>{t(provider.help)}</Text>
          </Pressable>
        ) : (
          <Text style={styles.note}>{t(provider.help)}</Text>
        )}
        <Text style={styles.note}>{t("mail-keychain")}</Text>
        <View style={mailStyles.buttons}>
          <Pressable
            style={({ pressed }) => [mailStyles.button, pressed && mailStyles.pressed]}
            accessibilityRole="button"
            onPress={() => router.back()}
          >
            <Text style={mailStyles.buttonText}>{t("mail-cancel")}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              mailStyles.button,
              mailStyles.primary,
              (!ready || busy) && !done && styles.disabled,
              pressed && mailStyles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityState={{ disabled: (!ready || busy) && !done, busy }}
            onPress={() => (done ? router.back() : void connect())}
          >
            <Text style={mailStyles.primaryText}>
              {t(done ? "mail-done" : busy ? "mail-connecting" : "mail-connect")}
            </Text>
          </Pressable>
        </View>
      </View>
      {done && (
        <View style={[mailStyles.card, styles.success]}>
          <View style={styles.resultHead}>
            <Text style={styles.check}>✓</Text>
            <Text style={styles.resultTitle}>{t("mail-connected-title")}</Text>
          </View>
          <Text style={mailStyles.body}>{t("mail-connected-body", { count: result.total })}</Text>
        </View>
      )}
      {result && !result.connected && (
        <View style={[mailStyles.card, styles.failed]}>
          <Text style={styles.resultTitle}>{t("mail-failed-title")}</Text>
          <Text style={mailStyles.body}>
            {t(MAIL_FAILURE_KEYS[result.failure ?? "unreachable"])}
          </Text>
        </View>
      )}
    </MailScreen>
  );
}

const styles = StyleSheet.create({
  input: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.lineStrong,
    paddingHorizontal: 12,
    fontSize: 14,
    color: color.ink,
  },
  inputFocus: { borderWidth: 1.5, borderColor: color.accent },
  secret: { letterSpacing: 3 },
  help: { fontSize: 12, color: color.accent },
  note: { fontSize: 12, lineHeight: 19, color: color.faded },
  disabled: { opacity: 0.4 },
  success: { borderColor: color.successLine },
  failed: { borderColor: color.attentionLine },
  resultHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  check: { fontWeight: "700", color: color.success },
  resultTitle: { fontSize: 14, fontWeight: "700", color: color.ink },
});
