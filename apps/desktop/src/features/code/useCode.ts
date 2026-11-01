import { useHubState } from "@xiaoban/client/react";
import type { FileDiff, GitInfo, Workspace } from "@xiaoban/protocol";
import { useCallback, useEffect, useState } from "react";
import { useHub } from "../../app/hub.tsx";

export function useWorkspaceOf(threadId: string | null): Workspace | null {
  const store = useHub();
  const { threads, workspaces } = useHubState(store);
  const id = threads.find((thread) => thread.id === threadId)?.workspaceId ?? null;
  return workspaces.find((workspace) => workspace.id === id) ?? null;
}

function useFocusTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((value) => value + 1);
    window.addEventListener("focus", bump);
    return () => window.removeEventListener("focus", bump);
  }, []);
  return tick;
}

export function useGit(workspace: Workspace | null): GitInfo | null {
  const store = useHub();
  const { filesVersion } = useHubState(store);
  const version = workspace ? (filesVersion[workspace.id] ?? 0) : 0;
  const focus = useFocusTick();
  const [git, setGit] = useState<GitInfo | null>(null);
  useEffect(() => {
    if (!workspace) {
      setGit(null);
      return;
    }
    let live = true;
    void version;
    void focus;
    store
      .gitInfo(workspace.id)
      .then((info) => live && setGit(info))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, workspace, version, focus]);
  return git;
}

export function useChanges(threadId: string, workspace: Workspace | null) {
  const store = useHub();
  const { filesVersion } = useHubState(store);
  const version = workspace ? (filesVersion[workspace.id] ?? 0) : 0;
  const focus = useFocusTick();
  const [files, setFiles] = useState<FileDiff[]>([]);
  useEffect(() => {
    if (!workspace) return;
    let live = true;
    void version;
    void focus;
    store
      .threadChanges(threadId)
      .then((list) => live && setFiles(list))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, threadId, workspace, version, focus]);
  const [undone, setUndone] = useState<string[]>([]);
  const revert = useCallback(
    (path: string, hunk: number | null) =>
      void store
        .revertChange(threadId, path, hunk)
        .then((list) => {
          setFiles(list);
          setUndone((current) => [...current.filter((item) => item !== path), path]);
        })
        .catch(() => undefined),
    [store, threadId],
  );
  const restore = useCallback(
    (path: string) =>
      void store
        .restoreChange(threadId, path)
        .then((list) => {
          setFiles(list);
          setUndone((current) => current.filter((item) => item !== path));
        })
        .catch(() => setUndone((current) => current.filter((item) => item !== path))),
    [store, threadId],
  );
  return { files, revert, restore, undone };
}

export function useCommands(workspace: Workspace | null) {
  const store = useHub();
  const { commands } = useHubState(store);
  useEffect(() => {
    if (workspace) void store.loadCommands(workspace.id).catch(() => undefined);
  }, [store, workspace]);
  return workspace ? (commands[workspace.id] ?? []) : [];
}

export function nameOf(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}
