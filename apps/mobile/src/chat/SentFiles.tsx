import type { HubStore } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { FileInfo } from "@xiaoban/protocol";
import { color, dark } from "@xiaoban/tokens";
import { useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useHubStore } from "../hub/HubProvider.tsx";

const cache = new Map<string, Promise<string>>();

function load(store: HubStore, id: string): Promise<string> {
  const known = cache.get(id);
  if (known) return known;
  const pending = store.fileData(id).catch((error: unknown) => {
    cache.delete(id);
    throw error;
  });
  cache.set(id, pending);
  return pending;
}

function useImage(id: string): string | null {
  const store = useHubStore();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void load(store, id)
      .then((value) => {
        if (alive) setUrl(value);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [store, id]);
  return url;
}

function Thumb({ file, size, onOpen }: { file: FileInfo; size: number; onOpen: () => void }) {
  const url = useImage(file.id);
  return (
    <Pressable onPress={onOpen} accessibilityRole="imagebutton" accessibilityLabel={file.name}>
      <View style={[styles.thumb, { width: size, height: size }]}>
        {url ? <Image source={{ uri: url }} style={{ width: size, height: size }} /> : null}
      </View>
    </Pressable>
  );
}

function Full({ file }: { file: FileInfo }) {
  const { width, height } = useWindowDimensions();
  const url = useImage(file.id);
  return (
    <View style={{ width, height, justifyContent: "center" }}>
      {url ? (
        <Image source={{ uri: url }} style={{ width, height: height * 0.8 }} resizeMode="contain" />
      ) : null}
    </View>
  );
}

export function SentFiles({
  files,
  align,
}: {
  files: FileInfo[];
  align: "flex-end" | "flex-start";
}) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const [viewing, setViewing] = useState<number | null>(null);
  if (files.length === 0) return null;
  const images = files.filter((file) => file.mode === "image");
  const documents = files.filter((file) => file.mode !== "image");
  const columns = images.length === 1 ? 1 : images.length <= 4 ? 2 : 3;
  const span = Math.min(width * 0.7, 280);
  const size = columns === 1 ? span : (span - (columns - 1) * 4) / columns;
  const meta = (file: FileInfo) => {
    const pages = file.pages ?? 0;
    if (file.mode === "full") return t("attach-read-full", { pages });
    if (file.mode === "on_demand") return t("attach-read-on-demand", { pages });
    return t("attach-unreadable");
  };
  return (
    <View style={[styles.wrap, { alignItems: align }]}>
      {images.length > 0 && (
        <View style={[styles.grid, { width: span }]}>
          {images.map((file, index) => (
            <Thumb key={file.id} file={file} size={size} onOpen={() => setViewing(index)} />
          ))}
        </View>
      )}
      {documents.map((file) => (
        <View key={file.id} style={styles.doc}>
          <Text style={styles.docName} numberOfLines={1}>
            {file.name}
          </Text>
          <Text style={styles.docMeta}>{meta(file)}</Text>
        </View>
      ))}
      <Modal
        visible={viewing !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewing(null)}
      >
        <Pressable style={styles.viewer} onPress={() => setViewing(null)}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: (viewing ?? 0) * width, y: 0 }}
          >
            {images.map((file) => (
              <Full key={file.id} file={file} />
            ))}
          </ScrollView>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginBottom: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  thumb: { borderRadius: 12, overflow: "hidden", backgroundColor: color.lineSoft },
  doc: {
    maxWidth: 260,
    backgroundColor: color.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  docName: { fontSize: 14, fontWeight: "500", color: color.ink },
  docMeta: { fontSize: 12, color: color.muted },
  viewer: { flex: 1, backgroundColor: dark.island, justifyContent: "center" },
});
