import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "xiaoban.panels";
const WORKSPACE_MIN = "(min-width: 1180px)";
const LIST_MIN = "(min-width: 900px)";

interface Panels {
  list: boolean;
  workspace: boolean;
}

function saved(): Panels {
  try {
    return {
      list: true,
      workspace: true,
      ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"),
    };
  } catch {
    return { list: true, workspace: true };
  }
}

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function usePanels() {
  const [preferred, setPreferred] = useState(saved);
  const [shown, setShown] = useState(preferred);
  const wide = useMedia(WORKSPACE_MIN);
  const roomy = useMedia(LIST_MIN);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferred));
  }, [preferred]);

  useEffect(() => {
    setShown((current) => ({ ...current, workspace: wide && preferred.workspace }));
  }, [wide, preferred.workspace]);

  useEffect(() => {
    setShown((current) => ({ ...current, list: roomy && preferred.list }));
  }, [roomy, preferred.list]);

  const toggle = useCallback(
    (panel: keyof Panels) => {
      const next = !shown[panel];
      setShown((current) => ({ ...current, [panel]: next }));
      setPreferred((current) => ({ ...current, [panel]: next }));
    },
    [shown],
  );

  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (!event.metaKey || !event.altKey) return;
      if (event.code === "KeyS") toggle("list");
      else if (event.code === "KeyI") toggle("workspace");
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [toggle]);

  return { ...shown, toggle };
}
