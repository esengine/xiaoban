import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { useEffect, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { MemorySky } from "./MemorySky.tsx";
import { MemorySkyView } from "./MemorySkyView.tsx";

export function MemoryPanel() {
  const { t } = useI18n();
  const store = useHub();
  const { memories, galaxies, usedMemories } = useHubState(store);
  const [open, setOpen] = useState(false);
  const signature = memories.map((memory) => `${memory.id}:${memory.galaxy ?? ""}`).join("|");
  useEffect(() => {
    if (signature !== undefined) void store.refreshGalaxies().catch(() => undefined);
  }, [signature, store]);
  const pinned = memories.filter((memory) => memory.pinned).length;
  const used = memories.filter((memory) => usedMemories.includes(memory.id));
  return (
    <div className="memory-panel">
      <div className="memory-panel__head">
        <h2 className="workspace__title">
          {used.length > 0 ? t("memory-graph-used-title") : t("workspace-memories")}
        </h2>
        <span className="memory-panel__count">
          {t("memory-sky-summary", { count: memories.length, pinned })}
        </span>
      </div>
      <div className="memory-panel__sky">
        <MemorySky
          memories={memories}
          galaxies={galaxies}
          used={usedMemories}
          full={false}
          onExpand={() => setOpen(true)}
        />
        <button type="button" className="memory-panel__expand" onClick={() => setOpen(true)}>
          {t("memory-sky-expand")}
        </button>
      </div>
      {used.length > 0 && (
        <ul className="memory-graph__list" data-used>
          {used.map((memory) => (
            <li key={memory.id}>
              <span className="memory-graph__text">
                {t("workspace-memory", { subject: memory.subject, value: memory.value })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && <MemorySkyView onClose={() => setOpen(false)} />}
    </div>
  );
}
