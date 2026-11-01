import type { HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { color, dark } from "@xiaoban/tokens";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Sheet, SheetAction } from "../life/LifeUI.tsx";
import { Icon } from "../ui/Icon.tsx";

const MAX_FILES = 9;
const MAX_BYTES = 20 * 1024 * 1024;
const IMAGE = /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/i;

export interface Pending {
  key: string;
  name: string;
  uri: string;
  image: boolean;
  path: string | null;
  problem: "too-big" | "failed" | null;
}

type Picked = { uri: string; name: string; size: number | null; image: boolean };

let counter = 0;

function nameOf(uri: string, fallback: string): string {
  return decodeURIComponent(uri.split("/").pop() ?? "") || fallback;
}

export type VisionChoice = "auto" | "ask" | "none";

export function useVisionChoice(store: HubStore): VisionChoice {
  const { model } = useHubState(store);
  if (!model) return "none";
  if (model.provider === "deepseek") return "auto";
  if (model.provider === "mimo" && model.model.includes("pro")) return "ask";
  return "none";
}

export function useAttachments(store: HubStore) {
  const [items, setItems] = useState<Pending[]>([]);

  const upload = useCallback(
    async (picked: Picked) => {
      counter += 1;
      const key = `a-${counter}`;
      const tooBig = picked.size !== null && picked.size > MAX_BYTES;
      setItems((current) => [
        ...current,
        {
          key,
          name: picked.name,
          uri: picked.uri,
          image: picked.image,
          path: null,
          problem: tooBig ? "too-big" : null,
        },
      ]);
      if (tooBig) return;
      try {
        const data = await new File(picked.uri).base64();
        const path = await store.uploadFile(picked.name, data);
        setItems((current) => current.map((item) => (item.key === key ? { ...item, path } : item)));
      } catch {
        setItems((current) =>
          current.map((item) => (item.key === key ? { ...item, problem: "failed" } : item)),
        );
      }
    },
    [store],
  );

  const pick = useCallback(
    async (kind: "camera" | "photos" | "file") => {
      const room = MAX_FILES - items.length;
      if (room <= 0) return;
      let picked: Picked[] = [];
      if (kind === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return;
        const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
        if (result.canceled) return;
        picked = result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.fileName ?? nameOf(asset.uri, "photo.jpg"),
          size: asset.fileSize ?? null,
          image: true,
        }));
      } else if (kind === "photos") {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: true,
          selectionLimit: room,
          quality: 0.8,
        });
        if (result.canceled) return;
        picked = result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.fileName ?? nameOf(asset.uri, "photo.jpg"),
          size: asset.fileSize ?? null,
          image: true,
        }));
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          multiple: true,
          copyToCacheDirectory: true,
        });
        if (result.canceled) return;
        picked = result.assets.map((asset) => ({
          uri: asset.uri,
          name: asset.name,
          size: asset.size ?? null,
          image: IMAGE.test(asset.name) || (asset.mimeType ?? "").startsWith("image/"),
        }));
      }
      for (const item of picked.slice(0, room)) void upload(item);
    },
    [items.length, upload],
  );

  const remove = useCallback(
    (key: string) => setItems((current) => current.filter((item) => item.key !== key)),
    [],
  );
  const dropImages = useCallback(
    () => setItems((current) => current.filter((item) => !item.image)),
    [],
  );
  const clear = useCallback(() => setItems([]), []);

  const ready = items.filter((item) => item.path !== null && item.problem === null);
  const uploading = items.some((item) => item.path === null && item.problem === null);
  return {
    items,
    pick,
    remove,
    dropImages,
    clear,
    paths: ready.map((item) => item.path ?? ""),
    hasImages: ready.some((item) => item.image),
    uploading,
    full: items.length >= MAX_FILES,
  };
}

export function AttachSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (kind: "camera" | "photos" | "file") => void;
}) {
  const { t } = useI18n();
  const choose = (kind: "camera" | "photos" | "file") => () => {
    onClose();
    onPick(kind);
  };
  return (
    <Sheet open={open} onClose={onClose}>
      <SheetAction label={t("attach-camera")} onPress={choose("camera")} />
      <SheetAction label={t("attach-photos")} onPress={choose("photos")} />
      <SheetAction label={t("attach-file")} onPress={choose("file")} />
    </Sheet>
  );
}

export function AttachmentStrip({
  items,
  onRemove,
}: {
  items: Pending[];
  onRemove: (key: string) => void;
}) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
    >
      {items.map((item) => (
        <View key={item.key} style={styles.cell}>
          <View style={[styles.tile, item.problem && styles.tileBad]}>
            {item.image ? (
              <Image source={{ uri: item.uri }} style={styles.thumb} />
            ) : (
              <Text style={styles.fileName} numberOfLines={3}>
                {item.name}
              </Text>
            )}
            {item.path === null && item.problem === null && (
              <View style={styles.cover}>
                <ActivityIndicator size="small" color={color.surface} />
              </View>
            )}
          </View>
          {item.problem && (
            <Text style={styles.problem} numberOfLines={1}>
              {t(item.problem === "too-big" ? "attach-too-big" : "attach-failed")}
            </Text>
          )}
          <Pressable
            style={styles.remove}
            onPress={() => onRemove(item.key)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("attach-remove", { name: item.name })}
          >
            <Icon name="close" size={10} color={color.surface} width={2.4} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

export function VisionNotice({
  choice,
  accepted,
  onAccept,
  onTextOnly,
}: {
  choice: VisionChoice;
  accepted: boolean;
  onAccept: () => void;
  onTextOnly: () => void;
}) {
  const { t } = useI18n();
  if (choice === "auto") return <Text style={styles.vision}>{t("attach-vision-deepseek")}</Text>;
  if (choice !== "ask" || accepted) return null;
  return (
    <View style={styles.ask}>
      <Text style={styles.vision}>{t("attach-vision-mimo")}</Text>
      <View style={styles.askRow}>
        <Pressable style={[styles.askButton, styles.askPrimary]} onPress={onAccept}>
          <Text style={styles.askPrimaryText}>{t("attach-vision-switch")}</Text>
        </Pressable>
        <Pressable style={styles.askButton} onPress={onTextOnly}>
          <Text style={styles.askText}>{t("attach-vision-text-only")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { gap: 8, paddingTop: 4, paddingRight: 4 },
  cell: { width: 60 },
  tile: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: color.ground,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: color.line,
  },
  tileBad: { borderColor: color.attention },
  thumb: { width: 56, height: 56 },
  fileName: {
    fontSize: 10,
    lineHeight: 13,
    color: color.inkMid,
    paddingHorizontal: 4,
    textAlign: "center",
  },
  cover: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: dark.scrim,
    alignItems: "center",
    justifyContent: "center",
  },
  problem: { fontSize: 10, color: color.attentionInk, marginTop: 2 },
  remove: {
    position: "absolute",
    top: -4,
    right: 0,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: color.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  vision: { fontSize: 12, lineHeight: 18, color: color.inkMid },
  ask: { gap: 6 },
  askRow: { flexDirection: "row", gap: 8 },
  askButton: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: color.lineStrong,
    justifyContent: "center",
  },
  askPrimary: { backgroundColor: color.ink, borderColor: color.ink },
  askText: { fontSize: 12, color: color.ink },
  askPrimaryText: { fontSize: 12, color: color.surface, fontWeight: "500" },
});
