import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { Device } from "@xiaoban/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { renderSVG } from "uqr";
import { useHub } from "../../app/hub.tsx";

interface Pairing {
  code: string;
  expiresAt: number;
  address: string | null;
  port: number;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function pairingLink({ address, port, code }: Pairing, name: string | undefined): string {
  const params = new URLSearchParams({
    host: address ?? "",
    port: String(port),
    code,
    ...(name ? { name } : {}),
  });
  return `xiaoban://pair?${params.toString()}`;
}

export function PairingPanel({ onPaired }: { onPaired?: (device: Device) => void }) {
  const { t } = useI18n();
  const store = useHub();
  const { hub } = useHubState(store);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [paired, setPaired] = useState<Device | null>(null);
  const notify = useRef(onPaired);
  notify.current = onPaired;
  const now = useNow(pairing !== null && paired === null);
  const remaining = pairing ? pairing.expiresAt - now : 0;
  const expired = pairing !== null && remaining <= 0;

  const refresh = useCallback(async () => {
    const response = await store.createPairingCode();
    setPairing({
      code: response.code,
      expiresAt: response.expiresAt,
      address: response.addresses[0] ?? null,
      port: response.port,
    });
  }, [store]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(
    () =>
      store.client.onEvent((event) => {
        if (event.type !== "device_paired") return;
        setPaired(event.device);
        notify.current?.(event.device);
      }),
    [store],
  );

  const qr = pairing?.address
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderSVG(pairingLink(pairing, hub?.name), { border: 1 }))}`
    : null;

  return (
    <div className="phone-step">
      <div className="phone-step__qr">
        {qr && !expired ? (
          <img src={qr} alt={t("phone-qr-label")} />
        ) : (
          <span>{t("phone-qr-label")}</span>
        )}
      </div>
      <div className="phone-step__info">
        <p className="phone-step__how">
          <span>{t("phone-step-install")}</span>
          <span>{t("phone-step-scan")}</span>
          <span>{t("phone-step-wifi")}</span>
        </p>
        <div className="phone-step__values">
          <div className="phone-step__value">
            <span>{t("phone-address-label")}</span>
            <strong>{pairing?.address ?? t("phone-no-network")}</strong>
          </div>
          <div className="phone-step__value">
            <span>
              {expired
                ? t("phone-code-expired")
                : t("phone-code-label", { time: formatCountdown(remaining) })}
            </span>
            <strong className="phone-step__code">
              {pairing ? `${pairing.code.slice(0, 3)} ${pairing.code.slice(3)}` : ""}
            </strong>
          </div>
        </div>
        {paired ? (
          <p className="phone-step__status phone-step__status--done">
            {t("phone-connected", { name: paired.name })}
          </p>
        ) : expired ? (
          <button type="button" className="link" onClick={() => void refresh()}>
            {t("phone-refresh")}
          </button>
        ) : (
          <p className="phone-step__status">{t("phone-waiting")}</p>
        )}
        <p className="phone-step__relay">{t("phone-relay-hint")}</p>
      </div>
    </div>
  );
}
