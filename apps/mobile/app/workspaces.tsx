import type { HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Workspace } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { router, Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHubContext } from "../src/hub/HubProvider.tsx";
import { LifeHeader, Sheet, SheetAction } from "../src/life/LifeUI.tsx";
import { Icon } from "../src/ui/Icon.tsx";

/** A workspace conversation lives in the phone's own hub, even while the phone is on a computer. */
export function openWorkspaceThread(threadId: string) {
  router.push({ pathname: "/thread/[id]", params: { id: threadId, hub: "local" } });
}

export default function WorkspacesScreen() {
  const { t } = useI18n();
  const { local } = useHubContext();
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false, title: t("ws-title") }} />
      <LifeHeader title={t("ws-title")} />
      {local ? (
        <Workspaces store={local} />
      ) : (
        <Text style={styles.note}>{t("ws-unavailable")}</Text>
      )}
    </View>
  );
}

function Workspaces({ store }: { store: HubStore }) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const state = useHubState(store);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<Workspace | null>(null);
  const [renaming, setRenaming] = useState<Workspace | null>(null);
  const [rename, setRename] = useState("");

  useEffect(() => {
    if (state.status === "open") void store.refreshWorkspaces().catch(() => undefined);
  }, [state.status, store]);

  const conversations = (workspace: Workspace) =>
    state.threads
      .filter((thread) => thread.workspaceId === workspace.id && !thread.parentId)
      .sort((a, b) => b.updatedAt - a.updatedAt);

  const open = async (workspace: Workspace) => {
    const latest = conversations(workspace)[0];
    const thread = latest ?? (await store.createThread(undefined, workspace.id));
    openWorkspaceThread(thread.id);
  };

  const create = async () => {
    const wanted = name.trim();
    if (!wanted || busy) return;
    setBusy(true);
    try {
      const workspace = await store.newWorkspace(wanted);
      setName("");
      setNaming(false);
      await open(workspace);
    } catch {
      Alert.alert(t("ws-create-failed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = (workspace: Workspace) =>
    Alert.alert(t("ws-delete-title", { name: workspace.name }), t("ws-delete-body"), [
      { text: t("ws-cancel"), style: "cancel" },
      {
        text: t("ws-delete-confirm"),
        style: "destructive",
        onPress: () => void store.removeWorkspace(workspace.id).catch(() => undefined),
      },
    ]);

  const workspaces = [...state.workspaces].sort((a, b) => b.activeAt - a.activeAt);
  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("ws-intro-title")}</Text>
        <Text style={styles.cardBody}>{t("ws-intro-body")}</Text>
      </View>
      {workspaces.length > 0 ? (
        <View style={[styles.card, styles.list]}>
          {workspaces.map((workspace, index) => {
            const count = conversations(workspace).length;
            return (
              <Pressable
                key={workspace.id}
                style={[styles.row, index > 0 && styles.rowLine]}
                onPress={() => void open(workspace)}
                onLongPress={() => setMenu(workspace)}
                delayLongPress={350}
                accessibilityRole="button"
              >
                <View style={styles.folder}>
                  <Icon name="folder" color={color.accentStrong} size={20} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.name} numberOfLines={1}>
                    {workspace.name}
                  </Text>
                  <Text style={styles.sub}>
                    {count > 0 ? t("ws-sub-count", { count }) : t("ws-sub-empty")}
                  </Text>
                </View>
                <Icon name="chevronRight" color={color.faint} size={18} />
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={styles.empty}>{t("ws-empty")}</Text>
      )}
      {naming ? (
        <View style={[styles.card, styles.naming]}>
          <TextInput
            autoFocus
            style={styles.input}
            value={name}
            maxLength={60}
            onChangeText={setName}
            placeholder={t("ws-name-placeholder")}
            placeholderTextColor={color.faint}
            returnKeyType="done"
            onSubmitEditing={() => void create()}
          />
          <View style={styles.actions}>
            <Pressable style={styles.ghost} onPress={() => setNaming(false)}>
              <Text style={styles.ghostText}>{t("ws-cancel")}</Text>
            </Pressable>
            <Pressable
              style={[styles.primary, (!name.trim() || busy) && styles.primaryOff]}
              disabled={!name.trim() || busy}
              onPress={() => void create()}
            >
              <Text style={styles.primaryText}>{t("ws-create")}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          style={styles.newButton}
          onPress={() => setNaming(true)}
          accessibilityRole="button"
        >
          <Text style={styles.newText}>{t("ws-new")}</Text>
        </Pressable>
      )}
      <Text style={styles.note}>{t("ws-note")}</Text>

      <Sheet open={menu !== null} onClose={() => setMenu(null)}>
        <SheetAction
          label={t("ws-menu-new-thread")}
          onPress={() => {
            const target = menu;
            setMenu(null);
            if (target) {
              void store
                .createThread(undefined, target.id)
                .then((thread) => openWorkspaceThread(thread.id))
                .catch(() => undefined);
            }
          }}
        />
        <SheetAction
          label={t("ws-menu-rename")}
          onPress={() => {
            setRename(menu?.name ?? "");
            setRenaming(menu);
            setMenu(null);
          }}
        />
        <SheetAction
          label={t("ws-menu-delete")}
          danger
          onPress={() => {
            const target = menu;
            setMenu(null);
            if (target) remove(target);
          }}
        />
      </Sheet>
      <Sheet open={renaming !== null} onClose={() => setRenaming(null)}>
        <Text style={styles.sheetTitle}>{t("ws-rename-title")}</Text>
        <TextInput
          autoFocus
          style={[styles.input, styles.sheetInput]}
          value={rename}
          maxLength={60}
          onChangeText={setRename}
          placeholderTextColor={color.faint}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (renaming && rename.trim()) {
              void store.renameWorkspace(renaming.id, rename.trim()).catch(() => undefined);
            }
            setRenaming(null);
          }}
        />
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: 14, paddingTop: 8, gap: 12 },
  card: {
    backgroundColor: color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.line,
    padding: 14,
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", color: color.ink },
  cardBody: { fontSize: 13, lineHeight: 21, color: color.muted },
  list: { padding: 0, gap: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  rowLine: { borderTopWidth: 1, borderTopColor: color.lineSoft },
  folder: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: color.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: "600", color: color.ink },
  sub: { fontSize: 12, color: color.faint },
  empty: { fontSize: 13, color: color.muted, textAlign: "center", paddingVertical: 12 },
  newButton: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: color.accentLine,
    backgroundColor: color.accentWash,
    alignItems: "center",
    justifyContent: "center",
  },
  newText: { fontSize: 14, fontWeight: "600", color: color.accentStrong },
  naming: { gap: 10 },
  input: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: color.accent,
    paddingHorizontal: 12,
    fontSize: 14,
    color: color.ink,
    backgroundColor: color.surface,
  },
  sheetInput: { marginHorizontal: 18, marginBottom: 18 },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: color.ink, padding: 18, paddingBottom: 12 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  ghost: { height: 40, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  ghostText: { fontSize: 14, color: color.muted },
  primary: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryOff: { backgroundColor: "#C4C8D2" },
  primaryText: { fontSize: 14, fontWeight: "500", color: color.surface },
  note: { fontSize: 12, lineHeight: 20, color: color.faint, paddingHorizontal: 4 },
});
