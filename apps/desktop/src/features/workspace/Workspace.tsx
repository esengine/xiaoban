import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { PairingDialog } from "../pairing/PairingDialog.tsx";

export function Workspace() {
  const { t } = useI18n();
  const store = useHub();
  const { memories, devices } = useHubState(store);
  const [pairing, setPairing] = useState(false);
  const phones = devices.filter((device) => device.platform !== "desktop");

  return (
    <aside className="workspace" aria-label={t("workspace-label")}>
      <section className="workspace__section">
        <h2 className="workspace__title">{t("workspace-memories")}</h2>
        {memories.length > 0 ? (
          <ul className="memory-chips">
            {memories.map((memory) => (
              <li key={memory.id} className="memory-chip">
                {t("workspace-memory", { subject: memory.subject, value: memory.value })}
              </li>
            ))}
          </ul>
        ) : (
          <p className="workspace__empty">{t("workspace-memories-empty")}</p>
        )}
        <p className="workspace__hint">{t("workspace-memories-hint")}</p>
      </section>
      <section className="workspace__section">
        <h2 className="workspace__title">{t("workspace-phone")}</h2>
        {phones.length > 0 ? (
          <ul className="workspace__devices">
            {phones.map((device) => (
              <li key={device.id} className="workspace__card">
                <span className="workspace__card-body">
                  {device.name}
                  <span className="workspace__card-note">{t("workspace-phone-connected")}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="workspace__card">
            <span className="workspace__card-body">
              {t("workspace-phone-none")}
              <span className="workspace__card-note">{t("workspace-phone-none-hint")}</span>
            </span>
            <button type="button" className="workspace__action" onClick={() => setPairing(true)}>
              {t("workspace-phone-connect")}
            </button>
          </div>
        )}
      </section>
      {pairing && <PairingDialog onClose={() => setPairing(false)} />}
    </aside>
  );
}
