import type { ExportedFile } from "@xiaoban/client";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useRef, useState } from "react";
import { Platform } from "react-native";

export type ReadyFile = { uri: string; name: string; mime: string };

export const MIME = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function target(name: string) {
  const folder = new Directory(Paths.cache, "exports");
  if (!folder.exists) folder.create({ intermediates: true });
  const file = new File(folder, name);
  if (file.exists) file.delete();
  return file;
}

export async function saveExport(exported: ExportedFile): Promise<ReadyFile> {
  const file = target(exported.name);
  file.create();
  await file.write(exported.data, { encoding: "base64" });
  return { uri: file.uri, name: exported.name, mime: exported.mime };
}

export async function keepFile(uri: string, name: string, mime: string): Promise<ReadyFile> {
  const file = target(name);
  await new File(uri).move(file);
  return { uri: file.uri, name, mime };
}

function share(file: ReadyFile) {
  return Sharing.shareAsync(file.uri, { mimeType: file.mime, dialogTitle: file.name });
}

export function useExporter(onReady: () => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const running = useRef(false);
  const start = (key: string, make: () => Promise<ReadyFile>) => {
    if (running.current) return;
    running.current = true;
    setBusy(key);
    setFailed(false);
    make()
      .then((file) => {
        onReady();
        setTimeout(() => void share(file).catch(() => undefined), Platform.OS === "ios" ? 400 : 0);
      })
      .catch(() => setFailed(true))
      .finally(() => {
        running.current = false;
        setBusy(null);
      });
  };
  return { busy, failed, start, clear: () => setFailed(false) };
}

export async function shareText(text: string, name: string, mime: string): Promise<void> {
  const file = target(name);
  file.create();
  file.write(text);
  await share({ uri: file.uri, name, mime });
}
