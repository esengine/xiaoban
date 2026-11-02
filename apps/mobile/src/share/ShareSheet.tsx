import { extensionOf, firstLink, type HubStore, hostOf, sizeText } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { ShareAction, SharedItem, ShareSuggestion } from "@xiaoban/protocol";
import { color, radius } from "@xiaoban/tokens";
import { File } from "expo-file-system";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { XiaobanHub } from "../../modules/xiaoban-hub/index.ts";
import { plain } from "../chat/plain.ts";
import { useHubContext } from "../hub/HubProvider.tsx";
import { Icon } from "../ui/Icon.tsx";
import { useKeyboard } from "../ui/useKeyboard.ts";
import { useReduceMotion } from "../ui/useReduceMotion.ts";
import { type Incoming, takeIncoming } from "./incoming.ts";

const REMOTE_WAIT = 2500;
const FINISHED_CHARS = 120;

interface Prepared {
  store: HubStore;
  item: SharedItem;
}

interface Handed {
  store: HubStore;
  turnId: string;
  threadId: string;
  threadTitle: string | null;
  done: string;
  memory: string | null;
  finished: string | null;
}

function close() {
  XiaobanHub?.closeShare?.();
}

function useOpen(store: HubStore | null): boolean {
  const [open, setOpen] = useState(store?.client.status === "open");
  useEffect(() => {
    if (!store) {
      setOpen(false);
      return;
    }
    setOpen(store.client.status === "open");
    return store.client.onStatus((status) => setOpen(status === "open"));
  }, [store]);
  return open;
}

function useTarget(): HubStore | null {
  const { phase, store, paired, onComputer } = useHubContext();
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), REMOTE_WAIT);
    return () => clearTimeout(timer);
  }, []);
  if (phase !== "ready") return null;
  return onComputer || !paired || waited ? store : null;
}

function firstLine(text: string | null): string | null {
  if (!text) return null;
  const link = firstLink(text);
  const line = (link ? text.replace(link, "") : text)
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean);
  return line ?? null;
}

function finishedText(markdown: string): string {
  const flat = plain(markdown);
  return flat.length > FINISHED_CHARS ? `${flat.slice(0, FINISHED_CHARS)}…` : flat;
}

export function ShareSheet() {
  const { t } = useI18n();
  const { phase } = useHubContext();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboard();
  const reduced = useReduceMotion();
  const target = useTarget();
  const open = useOpen(target);
  const [incoming, setIncoming] = useState<Incoming | null | undefined>(undefined);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [suggestion, setSuggestion] = useState<ShareSuggestion | null>(null);
  const [failed, setFailed] = useState(false);
  const [sending, setSending] = useState(false);
  const [handed, setHanded] = useState<Handed | null>(null);
  const [text, setText] = useState("");
  const rise = useRef(new Animated.Value(0)).current;
  const handedRef = useRef(false);

  useEffect(() => {
    const read = () => {
      void takeIncoming()
        .then((next) => {
          if (next === null && handedRef.current) return;
          handedRef.current = false;
          setHanded(null);
          setPrepared(null);
          setSuggestion(null);
          setFailed(false);
          setText("");
          setIncoming(next);
        })
        .catch(() => setIncoming(null));
    };
    read();
    const subscription = XiaobanHub?.addListener("onShare", read);
    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    Animated.timing(rise, {
      toValue: 1,
      duration: reduced ? 0 : 280,
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
      useNativeDriver: true,
    }).start();
  }, [rise, reduced]);

  useEffect(() => {
    if (!incoming || !target || !open || handedRef.current) return;
    let live = true;
    setPrepared(null);
    setSuggestion(null);
    setFailed(false);
    void (async () => {
      try {
        const files: string[] = [];
        for (const file of incoming.files) {
          files.push(await target.uploadFile(file.name, await new File(file.uri).base64()));
        }
        const item: SharedItem = {
          kind: incoming.kind,
          text: incoming.text,
          subject: incoming.subject,
          files,
        };
        if (!live) return;
        setPrepared({ store: target, item });
        const next = await target.suggestShare(item);
        if (live) setSuggestion(next);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [incoming, target, open]);

  useEffect(() => {
    if (!handed || handed.finished !== null) return;
    return handed.store.client.onEvent((event) => {
      if (event.type !== "turn_completed" || event.turnId !== handed.turnId) return;
      setHanded((current) =>
        current && current.turnId === event.turnId
          ? { ...current, finished: finishedText(event.message.text) }
          : current,
      );
    });
  }, [handed]);

  const memorySource = (): string => {
    const name = incoming?.files[0]?.name;
    if (incoming?.kind === "file" && name) return name;
    return suggestion?.title ?? hostOf(firstLink(incoming?.text)) ?? "";
  };

  const send = async (prompt: string, action: ShareAction | null) => {
    if (!prepared || sending || !prompt.trim()) return;
    setSending(true);
    try {
      const preferred =
        suggestion?.threadId ?? prepared.store.getSnapshot().preferences?.primaryThreadId;
      const { turnId, threadId } = await prepared.store.sendShare({
        item: prepared.item,
        threadId: preferred ?? "",
        prompt: prompt.trim(),
        remember: action?.remember ?? false,
      });
      handedRef.current = true;
      setHanded({
        store: prepared.store,
        turnId,
        threadId,
        threadTitle: threadId === suggestion?.threadId ? suggestion.threadTitle : null,
        done: action?.done ?? prompt.trim(),
        memory: action?.remember ? memorySource() : null,
        finished: null,
      });
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  const bottom = Math.max(insets.bottom, 0) + keyboard.height;
  const sheetMotion = {
    opacity: rise,
    transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
  };

  if (incoming === undefined) return <View style={styles.screen} />;

  const blocked =
    phase === "unpaired" || phase === "setup"
      ? t("share-not-ready")
      : incoming === null
        ? t("share-empty")
        : incoming.files.length === 0 && !incoming.text && !incoming.subject
          ? t(incoming.skipped > 0 ? "share-too-big" : "share-empty")
          : null;

  if (blocked || !incoming) {
    return (
      <View style={styles.screen}>
        <Pressable
          style={styles.scrim}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t("share-close")}
        />
        <Animated.View style={[styles.card, { bottom: bottom + 30 }, sheetMotion]}>
          <Text style={styles.cardNote}>{blocked}</Text>
          <Pressable
            style={[styles.button, styles.buttonDark]}
            onPress={close}
            accessibilityRole="button"
          >
            <Text style={styles.buttonDarkText}>{t("share-close")}</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  if (handed) {
    return (
      <View style={styles.screen}>
        <Pressable
          style={styles.scrim}
          onPress={close}
          accessibilityRole="button"
          accessibilityLabel={t("share-stay")}
        />
        <Animated.View
          style={[styles.card, { bottom: bottom + 30 }, sheetMotion]}
          accessibilityLiveRegion="polite"
        >
          <View style={styles.doneHead}>
            <View style={styles.check}>
              <Icon name="check" size={18} color={color.success} width={2.8} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.doneTitle}>
                {t(handed.finished === null ? "share-done-title" : "share-finished-title")}
              </Text>
              <Text style={styles.doneWhere}>
                {handed.threadTitle
                  ? t("share-done-where", { title: handed.threadTitle })
                  : t("share-done-main")}
              </Text>
            </View>
          </View>
          <Text style={styles.doneText}>{handed.finished ?? handed.done}</Text>
          {handed.memory && (
            <Text style={styles.cardNote}>{t("share-done-memory", { source: handed.memory })}</Text>
          )}
          <View style={styles.buttons}>
            <Pressable
              style={[styles.button, styles.buttonLine]}
              onPress={close}
              accessibilityRole="button"
            >
              <Text style={styles.buttonText}>{t("share-stay")}</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.buttonDark]}
              onPress={() => XiaobanHub?.openFromShare?.(`xiaoban://thread/${handed.threadId}`)}
              accessibilityRole="button"
            >
              <Text style={styles.buttonDarkText}>{t("share-open")}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    );
  }

  const ready = prepared !== null && !sending;
  return (
    <View style={styles.screen}>
      <Pressable
        style={styles.scrim}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel={t("share-close")}
      />
      <Animated.View style={[styles.sheet, { paddingBottom: 24 + bottom }, sheetMotion]}>
        <View style={styles.head}>
          <View style={styles.logo}>
            <Icon name="face" size={18} color={color.surface} width={2} />
          </View>
          <Text style={styles.headTitle}>{t("share-sheet-title")}</Text>
          <Text style={styles.kind}>{t(`share-kind-${incoming.kind}`)}</Text>
        </View>
        <Preview incoming={incoming} suggestion={suggestion} />
        <Text style={styles.guess}>{t("share-guess")}</Text>
        <View>
          {suggestion ? (
            suggestion.actions.map((action) => (
              <Pressable
                key={action.label}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => void send(action.prompt, action)}
                disabled={!ready}
                accessibilityRole="button"
                accessibilityLabel={action.hint ? `${action.label}, ${action.hint}` : action.label}
              >
                <View style={styles.flex}>
                  <Text style={styles.rowLabel}>{action.label}</Text>
                  {action.hint && (
                    <Text style={styles.rowHint} numberOfLines={2}>
                      {action.hint}
                    </Text>
                  )}
                </View>
                <Icon name="chevronRight" size={14} color={color.faded} />
              </Pressable>
            ))
          ) : (
            <View style={styles.waiting}>
              {failed ? (
                <Text style={styles.problem}>{t("share-failed")}</Text>
              ) : (
                <>
                  <View style={styles.waitingRow}>
                    <ActivityIndicator size="small" color={color.faded} />
                    <Text style={styles.rowHint}>
                      {prepared ? t("share-guessing") : t("share-uploading")}
                    </Text>
                  </View>
                  <View style={[styles.bar, styles.barWide]} />
                  <View style={[styles.bar, styles.barShort]} />
                </>
              )}
            </View>
          )}
          {suggestion && failed && <Text style={styles.problem}>{t("share-failed")}</Text>}
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={t("share-input-placeholder")}
            placeholderTextColor={color.faded}
            accessibilityLabel={t("share-input-label")}
            returnKeyType="send"
            onSubmitEditing={() => void send(text, null)}
          />
          <Pressable
            style={[styles.send, (!ready || !text.trim()) && styles.sendOff]}
            onPress={() => void send(text, null)}
            disabled={!ready || !text.trim()}
            accessibilityRole="button"
          >
            {sending ? (
              <ActivityIndicator size="small" color={color.surface} />
            ) : (
              <Text style={styles.sendText}>{t("share-send")}</Text>
            )}
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

function Preview({
  incoming,
  suggestion,
}: {
  incoming: Incoming;
  suggestion: ShareSuggestion | null;
}) {
  const { t } = useI18n();
  const first = incoming.files[0];
  const total = incoming.files.reduce((sum, file) => sum + file.size, 0);
  const link = firstLink(incoming.text);
  const fallback =
    incoming.kind === "image"
      ? t("share-title-image")
      : incoming.kind === "file"
        ? (first?.name ?? "")
        : (incoming.subject ?? firstLine(incoming.text) ?? hostOf(link) ?? "");
  const title = suggestion?.title ?? fallback;
  const pages = suggestion?.pages ?? null;
  const meta =
    incoming.kind === "image"
      ? t("share-images", { n: incoming.files.length })
      : incoming.kind === "link"
        ? t("share-link-meta", { source: suggestion?.source ?? hostOf(link) ?? "" })
        : incoming.kind === "file"
          ? pages !== null && incoming.files.length === 1
            ? t("share-pages-size", { pages, size: sizeText(total) })
            : incoming.files.length > 1
              ? t("share-files", { n: incoming.files.length })
              : sizeText(total)
          : t("share-kind-text");
  return (
    <View style={styles.preview}>
      {incoming.kind === "image" && first ? (
        <Image source={{ uri: first.uri }} style={styles.shot} resizeMode="cover" />
      ) : incoming.kind === "file" && first ? (
        <View style={styles.fileTile}>
          <Text style={styles.fileExt} numberOfLines={1}>
            {extensionOf(first.name)}
          </Text>
        </View>
      ) : (
        <View style={styles.linkTile} />
      )}
      <View style={styles.flex}>
        <Text style={styles.previewTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.previewMeta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: color.sheetScrim },
  flex: { flex: 1, minWidth: 0 },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: 14,
    paddingHorizontal: 16,
    gap: 10,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  headTitle: { flex: 1, fontSize: 16, fontWeight: "700", color: color.ink },
  kind: { fontSize: 12, color: color.faded },
  preview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: radius.md,
    backgroundColor: color.ground,
  },
  shot: { width: 56, height: 90, borderRadius: 6, backgroundColor: color.neutralSoft },
  linkTile: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: color.neutralSoft },
  fileTile: {
    width: 40,
    height: 48,
    borderRadius: 6,
    backgroundColor: color.attentionSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  fileExt: { fontSize: 11, fontWeight: "700", color: color.attentionInk },
  previewTitle: { fontSize: 13, fontWeight: "600", color: color.ink },
  previewMeta: { fontSize: 12, color: color.faded, marginTop: 2 },
  guess: { fontSize: 12, color: color.faded },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
  },
  rowPressed: { opacity: 0.6 },
  rowLabel: { fontSize: 14, color: color.ink },
  rowHint: { fontSize: 11, color: color.faded, marginTop: 2 },
  waiting: {
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
    minHeight: 120,
  },
  waitingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  bar: { height: 12, borderRadius: 5, backgroundColor: color.neutralSoft },
  barWide: { width: "70%" },
  barShort: { width: "45%" },
  problem: { fontSize: 12, color: color.attentionInk, paddingVertical: 6 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: color.ground,
    paddingHorizontal: 12,
    fontSize: 13,
    color: color.ink,
  },
  send: {
    height: 36,
    minWidth: 52,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  sendOff: { opacity: 0.4 },
  sendText: { fontSize: 13, fontWeight: "600", color: color.surface },
  card: {
    position: "absolute",
    left: 16,
    right: 16,
    padding: 14,
    gap: 10,
    borderRadius: radius.bubble,
    backgroundColor: color.surface,
    shadowColor: color.ink,
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  doneHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  check: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: color.successSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  doneTitle: { fontSize: 15, fontWeight: "700", color: color.ink },
  doneWhere: { fontSize: 12, color: color.muted, marginTop: 2 },
  doneText: {
    fontSize: 13,
    lineHeight: 21,
    color: color.inkSoft,
    backgroundColor: color.ground,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardNote: { fontSize: 12, lineHeight: 18, color: color.faded },
  buttons: { flexDirection: "row", gap: 8 },
  button: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonLine: { borderWidth: 1, borderColor: color.lineStrong, backgroundColor: color.surface },
  buttonDark: { backgroundColor: color.ink },
  buttonText: { fontSize: 13, color: color.ink },
  buttonDarkText: { fontSize: 13, fontWeight: "600", color: color.surface },
});
