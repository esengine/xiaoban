import type { ExportedFile, HubStore } from "@xiaoban/client";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { saveExport } from "../work/exportFile.ts";

/** Hand a file or zip from a workspace to the system share sheet. */
export async function shareExport(exported: ExportedFile): Promise<void> {
  const ready = await saveExport(exported);
  await Sharing.shareAsync(ready.uri, { mimeType: ready.mime, dialogTitle: ready.name });
}

/** Let the user pick files, and put them into the workspace. Null when nothing was picked. */
export async function importPicked(
  store: HubStore,
  workspaceId: string,
): Promise<{ saved: number; skipped: number } | null> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: "*/*",
  });
  if (result.canceled) return null;
  let saved = 0;
  let skipped = 0;
  for (const asset of result.assets) {
    const data = await new File(asset.uri).base64();
    const done = await store.importWorkspaceFile(workspaceId, asset.name, data);
    saved += done.saved;
    skipped += done.skipped;
  }
  return { saved, skipped };
}
