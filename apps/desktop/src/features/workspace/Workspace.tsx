import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { MemoryPanel } from "../memory/MemoryPanel.tsx";
import { PairingDialog } from "../pairing/PairingDialog.tsx";
import { range, stopCount } from "../trip/format.ts";
import { MapIcon } from "../trip/icons.tsx";
import { useTrip } from "../trip/TripCard.tsx";

function TripOutput({ tripId, onOpen }: { tripId: string; onOpen: () => void }) {
  const { t } = useI18n();
  const trip = useTrip(tripId, null);
  if (!trip) return null;
  return (
    <li>
      <button type="button" className="workspace__card workspace__output" onClick={onOpen}>
        <span className="workspace__output-icon">
          <MapIcon />
        </span>
        <span className="workspace__card-body">
          {trip.title}
          <span className="workspace__card-note">
            {t("workspace-trip", { range: range(t, trip), count: stopCount(trip) })}
          </span>
        </span>
        <span className="workspace__output-open">{t("workspace-open")}</span>
      </button>
    </li>
  );
}

export function Workspace({
  threadId,
  onOpenTrip,
}: {
  threadId: string | null;
  onOpenTrip: (tripId: string, version: number | null) => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const { devices, messages } = useHubState(store);
  const tripIds = [
    ...new Set(
      (threadId ? (messages[threadId] ?? []) : []).flatMap((message) =>
        message.attachment?.kind === "trip" ? [message.attachment.tripId] : [],
      ),
    ),
  ].reverse();
  const [pairing, setPairing] = useState(false);
  const phones = devices.filter((device) => device.platform !== "desktop");

  return (
    <aside className="workspace" aria-label={t("workspace-label")}>
      {tripIds.length > 0 && (
        <section className="workspace__section">
          <h2 className="workspace__title">{t("workspace-outputs")}</h2>
          <ul className="workspace__outputs">
            {tripIds.map((tripId) => (
              <TripOutput key={tripId} tripId={tripId} onOpen={() => onOpenTrip(tripId, null)} />
            ))}
          </ul>
        </section>
      )}
      <section className="workspace__section">
        <MemoryPanel />
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
