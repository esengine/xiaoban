import { invoke, isTauri } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";

export const MAX_FILES = 9;
export const MAX_BYTES = 20 * 1024 * 1024;

export interface Picked {
  path: string;
  name: string;
  size: number;
  image: boolean;
  preview: string | null;
}

export interface Attached extends Picked {
  key: string;
  problem: "too-big" | "too-many" | null;
}

let counter = 0;

function judge(list: Picked[]): Attached[] {
  return list.map((file, index) => {
    counter += 1;
    return {
      ...file,
      key: `${counter}-${file.path}`,
      problem: file.size > MAX_BYTES ? "too-big" : index >= MAX_FILES ? "too-many" : null,
    };
  });
}

export function useAttachments() {
  const [files, setFiles] = useState<Attached[]>([]);
  const [fresh, setFresh] = useState<Picked[]>([]);

  const addPaths = useCallback(async (paths: string[], offer = false) => {
    if (!isTauri() || paths.length === 0) return;
    const picked = await invoke<Picked[]>("describe_files", { paths });
    setFiles((current) => judge([...current, ...picked]));
    if (offer) setFresh(picked.filter((file) => file.size <= MAX_BYTES).slice(0, MAX_FILES));
  }, []);

  const addBlobs = useCallback(
    async (blobs: File[]) => {
      if (!isTauri()) return;
      const paths = await Promise.all(
        blobs.map(async (blob) =>
          invoke<string>("stash_file", {
            name: blob.name || "image.png",
            bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
          }),
        ),
      );
      await addPaths(paths, true);
    },
    [addPaths],
  );

  const remove = useCallback(
    (key: string) => setFiles((current) => judge(current.filter((file) => file.key !== key))),
    [],
  );
  const clear = useCallback(() => setFiles([]), []);
  const settle = useCallback(() => setFresh([]), []);
  const removePaths = useCallback(
    (paths: string[]) =>
      setFiles((current) => judge(current.filter((file) => !paths.includes(file.path)))),
    [],
  );
  const dropImages = useCallback(
    () => setFiles((current) => judge(current.filter((file) => !file.image))),
    [],
  );

  const ready = files.filter((file) => file.problem === null);
  return {
    files,
    ready,
    hasImages: ready.some((file) => file.image),
    blocked: files.some((file) => file.problem !== null),
    fresh,
    settle,
    addPaths,
    addBlobs,
    remove,
    removePaths,
    clear,
    dropImages,
  };
}

export type AttachmentsState = ReturnType<typeof useAttachments>;
