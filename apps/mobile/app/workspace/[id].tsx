import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { DirEntry } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LifeHeader, Sheet, SheetAction } from "../../src/life/LifeUI.tsx";
import { Icon } from "../../src/ui/Icon.tsx";
import { importPicked, shareExport } from "../../src/workspace/transfer.ts";
import { useWorkspaceStore } from "../../src/workspace/useWorkspaceStore.ts";

/** The files of a workspace, a folder at a time. Read only: changes are made by asking. */
export default function WorkspaceFilesScreen() {
  const { id, hub } = useLocalSearchParams<{ id: string; hub?: string }>();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const store = useWorkspaceStore();
  const state = useHubState(store);
  const [folders, setFolders] = useState<Record<string, DirEntry[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const workspace = state.workspaces.find((item) => item.id === id);
  const version = state.filesVersion[id] ?? 0;

  const load = useCallback(
    async (path: string) => {
      try {
        const entries = await store.listDir(id, path);
        setFolders((current) => ({ ...current, [path]: entries }));
        setFailed(false);
      } catch {
        setFailed(true);
      }
    },
    [id, store],
  );

  useEffect(() => {
    if (state.status !== "open") return;
    void load("");
    for (const path of Object.keys(open)) if (open[path]) void load(path);
  }, [state.status, version, load]);

  const run = async (job: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await job();
    } catch {
      Alert.alert(t("ws-transfer-failed"));
    } finally {
      setBusy(false);
    }
  };

  const exportAll = () => run(async () => shareExport(await store.exportWorkspace(id)));

  const importFiles = () =>
    run(async () => {
      const done = await importPicked(store, id);
      if (!done) return;
      void load("");
      Alert.alert(
        done.saved > 0 ? t("ws-import-done", { saved: done.saved }) : t("ws-import-none"),
        done.skipped > 0 ? t("ws-import-skipped", { skipped: done.skipped }) : undefined,
      );
    });

  const toggle = (path: string) => {
    const next = !open[path];
    setOpen((current) => ({ ...current, [path]: next }));
    if (next && !folders[path]) void load(path);
  };

  const rows: { entry: DirEntry; depth: number }[] = [];
  const walk = (path: string, depth: number) => {
    for (const entry of folders[path] ?? []) {
      rows.push({ entry, depth });
      if (entry.dir && open[entry.path]) walk(entry.path, depth + 1);
    }
  };
  walk("", 0);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false, title: t("ws-files-title") }} />
      <LifeHeader
        title={workspace?.name ?? t("ws-files-title")}
        sub={t("ws-files-title")}
        right={
          <Pressable
            style={styles.more}
            accessibilityRole="button"
            accessibilityLabel={t("chat-more")}
            onPress={() => setMenu(true)}
          >
            <Icon name="more" color={color.ink} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {failed ? <Text style={styles.note}>{t("ws-file-failed")}</Text> : null}
        {!failed && folders[""] && folders[""].length === 0 ? (
          <Text style={styles.note}>{t("ws-files-empty")}</Text>
        ) : null}
        {rows.length > 0 ? (
          <View style={styles.card}>
            {rows.map(({ entry, depth }, index) => (
              <Pressable
                key={entry.path}
                style={[styles.row, index > 0 && styles.rowLine, { paddingLeft: 14 + depth * 18 }]}
                accessibilityRole="button"
                onPress={() =>
                  entry.dir
                    ? toggle(entry.path)
                    : router.push({
                        pathname: "/workspace/file",
                        params: { id, path: entry.path, ...(hub ? { hub } : {}) },
                      })
                }
              >
                {entry.dir ? (
                  <View style={styles.caret}>
                    <Icon
                      name={open[entry.path] ? "chevronDown" : "chevronRight"}
                      color={color.faint}
                      size={16}
                    />
                  </View>
                ) : (
                  <View style={styles.caret} />
                )}
                <Text style={[styles.name, entry.dir && styles.folder]} numberOfLines={1}>
                  {entry.dir ? `${entry.name}/` : entry.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Text style={styles.hint}>{t("ws-files-hint")}</Text>
      </ScrollView>
      <Sheet open={menu} onClose={() => setMenu(false)}>
        <SheetAction
          label={t("ws-export-all")}
          onPress={() => {
            setMenu(false);
            void exportAll();
          }}
        />
        <SheetAction
          label={t("ws-import")}
          onPress={() => {
            setMenu(false);
            void importFiles();
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: 14, paddingTop: 8, gap: 12 },
  more: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  card: {
    backgroundColor: color.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: color.line,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingRight: 14,
  },
  rowLine: { borderTopWidth: 1, borderTopColor: color.lineSoft },
  caret: { width: 18, alignItems: "center" },
  name: { flex: 1, fontSize: 14, color: color.ink, fontFamily: "monospace" },
  folder: { fontWeight: "600" },
  note: { fontSize: 13, color: color.muted, textAlign: "center", paddingVertical: 16 },
  hint: { fontSize: 12, lineHeight: 20, color: color.faint, paddingHorizontal: 4 },
});
