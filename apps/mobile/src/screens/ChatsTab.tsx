import type { HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Thread } from "@xiaoban/protocol";
import { color, dark } from "@xiaoban/tokens";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { markRead, markUnread, useUnread } from "../hub/unread.ts";
import { Sheet, SheetAction } from "../life/LifeUI.tsx";
import { firstChar, toneOf } from "../ui/format.ts";
import { Icon } from "../ui/Icon.tsx";
import { useWhen } from "../ui/useWhen.ts";

type Tone = { bg: string; fg: string };

const TONES: [Tone, Tone, Tone, Tone, Tone] = [
  { bg: color.accentSoft, fg: color.accentStrong },
  { bg: color.attentionSoft, fg: color.attentionInk },
  { bg: color.successSoft, fg: color.success },
  { bg: color.neutralSoft, fg: color.inkSoft },
  { bg: color.purpleSoft, fg: color.tripPurple },
];

type Filter = "all" | "confirm" | "running";

export function openThread(id: string, options: { plan?: boolean } = {}) {
  markRead(id);
  router.push({
    pathname: "/thread/[id]",
    params: options.plan ? { id, plan: "open" } : { id },
  });
}

export function ChatsTab({ store }: { store: HubStore }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const state = useHubState(store);
  const when = useWhen();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState<string | null>(null);
  const [menu, setMenu] = useState<Thread | null>(null);
  const [renaming, setRenaming] = useState<Thread | null>(null);
  const [name, setName] = useState("");
  const unread = useUnread();
  useEffect(() => {
    if (state.status !== "open") return;
    void store.listPlans().catch(() => undefined);
    void store.refreshConfirms().catch(() => undefined);
  }, [store, state.status]);
  const primaryId = state.preferences?.primaryThreadId ?? null;
  const primary = state.threads.find((thread) => thread.id === primaryId) ?? null;
  const waiting = new Set(state.confirms.map((confirm) => confirm.threadId));
  const running = new Set(
    Object.values(state.drafts)
      .filter((draft) => !draft.failure)
      .map((draft) => draft.threadId),
  );
  const planOf = (thread: Thread) => {
    const plan = state.plans[thread.id];
    return plan && plan.status !== "draft" ? plan : null;
  };
  const needle = (query ?? "").trim().toLowerCase();
  const rows = state.threads
    .filter((thread) => thread.id !== primaryId && !thread.parentId)
    .filter((thread) =>
      filter === "confirm"
        ? waiting.has(thread.id)
        : filter === "running"
          ? running.has(thread.id)
          : true,
    )
    .filter(
      (thread) =>
        !needle ||
        `${thread.title ?? ""} ${thread.lastMessage ?? ""}`.toLowerCase().includes(needle),
    );

  const create = async () => {
    const thread = await store.createThread();
    openThread(thread.id);
  };

  const tag = (thread: Thread) => {
    if (waiting.has(thread.id)) return { text: t("chats-tag-confirm"), tone: TONES[1] };
    const plan = planOf(thread);
    if (plan) {
      const done = plan.steps.filter((step) => step.status === "done").length;
      return {
        text: t("chats-tag-plan", { done, total: plan.steps.length }),
        tone: TONES[0],
      };
    }
    if (running.has(thread.id)) return { text: t("chats-tag-running"), tone: TONES[0] };
    if (thread.workspaceId) return { text: t("ws-tag"), tone: TONES[3] };
    return null;
  };

  const chips: { id: Filter; label: string; tone: Tone | null }[] = [
    { id: "all", label: t("chats-all"), tone: null },
    ...(waiting.size > 0
      ? [
          {
            id: "confirm" as const,
            label: t("chats-confirm", { count: waiting.size }),
            tone: TONES[1],
          },
        ]
      : []),
    ...(running.size > 0
      ? [
          {
            id: "running" as const,
            label: t("chats-running", { count: running.size }),
            tone: TONES[0],
          },
        ]
      : []),
  ];

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.title} accessibilityRole="header">
          {t("app-name")}
        </Text>
        <View style={styles.actions}>
          <Pressable
            style={styles.iconButton}
            accessibilityLabel={t("chats-search")}
            onPress={() => setQuery(query === null ? "" : null)}
          >
            <Icon name="search" color={color.ink} />
          </Pressable>
          <Pressable
            style={styles.iconButton}
            accessibilityLabel={t("ws-title")}
            onPress={() => router.push("/workspaces")}
          >
            <Icon name="folder" color={color.ink} />
          </Pressable>
          <Pressable
            style={styles.iconButton}
            accessibilityLabel={t("thread-new")}
            onPress={create}
          >
            <Icon name="plusCircle" color={color.ink} />
          </Pressable>
        </View>
      </View>
      {query !== null && (
        <TextInput
          autoFocus
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={t("chats-search-placeholder")}
          placeholderTextColor={color.faint}
        />
      )}
      {state.status !== "open" && (
        <Text style={styles.offline}>{t("connection-waiting-for-hub")}</Text>
      )}
      {primary && (
        <Pressable style={styles.primary} onPress={() => openThread(primary.id)}>
          <View style={styles.primaryMark}>
            <Icon name="face" color={color.surface} size={26} />
          </View>
          <View style={styles.flex}>
            <View style={styles.line}>
              <Text style={styles.primaryName}>{t("app-name")}</Text>
              <Text style={styles.primaryTime}>{when(primary.updatedAt)}</Text>
            </View>
            <Text style={styles.primaryLast} numberOfLines={1}>
              {primary.lastMessage ?? t("chats-primary-empty")}
            </Text>
          </View>
          {state.confirms.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{state.confirms.length}</Text>
            </View>
          )}
        </Pressable>
      )}
      <View style={styles.chips}>
        {chips.map((chip) => {
          const active = chip.id === filter;
          return (
            <Pressable
              key={chip.id}
              onPress={() => setFilter(chip.id)}
              style={[
                styles.chip,
                { backgroundColor: chip.tone ? chip.tone.bg : color.surface },
                active && chip.tone && styles.chipActive,
              ]}
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: chip.tone ? chip.tone.fg : color.ink },
                  active && styles.chipTextActive,
                ]}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.sheet}>
        <FlatList<Thread>
          data={rows}
          keyExtractor={(thread) => thread.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>{t("thread-list-hint")}</Text>}
          renderItem={({ item }) => {
            const name = item.title ?? t("thread-untitled");
            const tone: Tone = TONES[toneOf(item.id, TONES.length)] ?? TONES[0];
            const label = tag(item);
            return (
              <Pressable
                style={styles.row}
                onPress={() => openThread(item.id)}
                onLongPress={() => setMenu(item)}
                delayLongPress={350}
              >
                <View style={[styles.mark, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.markText, { color: tone.fg }]}>{firstChar(name)}</Text>
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.line}>
                    <Text style={styles.name} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.time}>{when(item.updatedAt)}</Text>
                    {unread.has(item.id) && <View style={styles.unread} />}
                  </View>
                  <View style={styles.sub}>
                    {label && (
                      <Text
                        style={[
                          styles.tag,
                          { backgroundColor: label.tone.bg, color: label.tone.fg },
                        ]}
                      >
                        {label.text}
                      </Text>
                    )}
                    <Text style={styles.last} numberOfLines={1}>
                      {item.lastMessage ?? ""}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          }}
        />
      </View>
      <Sheet open={menu !== null} onClose={() => setMenu(null)}>
        <SheetAction
          label={t("menu-open")}
          onPress={() => {
            if (menu) openThread(menu.id);
            setMenu(null);
          }}
        />
        <SheetAction
          label={t("menu-rename")}
          onPress={() => {
            setName(menu?.title ?? "");
            setRenaming(menu);
            setMenu(null);
          }}
        />
        <SheetAction
          label={t("menu-mark-unread")}
          disabled={menu !== null && unread.has(menu.id)}
          onPress={() => {
            if (menu) markUnread(menu.id);
            setMenu(null);
          }}
        />
        <SheetAction
          label={t("menu-delete-thread")}
          danger
          onPress={() => {
            const target = menu;
            setMenu(null);
            if (!target) return;
            Alert.alert(
              t("delete-thread-title", { title: target.title ?? t("thread-untitled") }),
              t("delete-thread-body"),
              [
                { text: t("dialog-cancel"), style: "cancel" },
                {
                  text: t("delete-thread-confirm"),
                  style: "destructive",
                  onPress: () => void store.deleteThread(target.id).catch(() => undefined),
                },
              ],
            );
          }}
        />
      </Sheet>
      <Sheet open={renaming !== null} onClose={() => setRenaming(null)}>
        <Text style={styles.renameTitle}>{t("menu-rename")}</Text>
        <TextInput
          autoFocus
          style={styles.renameInput}
          value={name}
          onChangeText={setName}
          selectTextOnFocus
          accessibilityLabel={t("menu-rename")}
        />
        <Pressable
          style={[styles.renameSave, !name.trim() && styles.renameDisabled]}
          disabled={!name.trim()}
          onPress={() => {
            const target = renaming;
            setRenaming(null);
            if (target) void store.renameThread(target.id, name.trim()).catch(() => undefined);
          }}
          accessibilityRole="button"
        >
          <Text style={styles.renameSaveText}>{t("thread-rename-save")}</Text>
        </Pressable>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  flex: { flex: 1, minWidth: 0 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 22, fontWeight: "700", color: color.ink, letterSpacing: 0.5 },
  actions: { flexDirection: "row", gap: 4 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  search: {
    paddingVertical: 0,
    textAlignVertical: "center",
    marginHorizontal: 16,
    marginBottom: 10,
    height: 40,
    borderRadius: 12,
    backgroundColor: color.surface,
    paddingHorizontal: 12,
    fontSize: 14,
    color: color.ink,
  },
  offline: { textAlign: "center", fontSize: 12, color: color.attentionInk, paddingBottom: 8 },
  primary: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    padding: 14,
    backgroundColor: color.ink,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  primaryMark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  line: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 },
  primaryName: { fontSize: 16, fontWeight: "700", color: color.surface },
  primaryTime: { fontSize: 12, color: dark.textMuted },
  primaryLast: { fontSize: 14, color: dark.textSoft, marginTop: 3 },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: color.attention,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: color.ink },
  chips: { flexDirection: "row", gap: 8, marginHorizontal: 16, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  chipActive: { borderWidth: 1, borderColor: color.ink },
  chipText: { fontSize: 13 },
  chipTextActive: { fontWeight: "500" },
  sheet: {
    flex: 1,
    backgroundColor: color.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  list: { paddingVertical: 8 },
  empty: {
    textAlign: "center",
    color: color.muted,
    marginTop: 60,
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: "center",
  },
  mark: { width: 46, height: 46, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  markText: { fontSize: 17, fontWeight: "700" },
  rowBody: {
    flex: 1,
    minWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: color.lineSoft,
    paddingBottom: 12,
    marginBottom: -12,
  },
  name: { flex: 1, fontSize: 15, fontWeight: "500", color: color.ink },
  time: { fontSize: 12, color: color.faint },
  sub: { flexDirection: "row", gap: 6, alignItems: "center", marginTop: 4 },
  tag: {
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: "hidden",
  },
  last: { flex: 1, fontSize: 13, color: color.muted },
  unread: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent },
  renameTitle: { fontSize: 16, fontWeight: "700", color: color.ink, paddingVertical: 4 },
  renameInput: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.accent,
    paddingHorizontal: 12,
    fontSize: 15,
    color: color.ink,
  },
  renameSave: {
    height: 46,
    borderRadius: 14,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  renameDisabled: { opacity: 0.4 },
  renameSaveText: { fontSize: 15, fontWeight: "500", color: color.surface },
});
