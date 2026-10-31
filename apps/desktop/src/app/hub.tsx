import { invoke, isTauri } from "@tauri-apps/api/core";
import { HubClient, HubStore } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import { createContext, type ReactNode, use, useEffect, useState } from "react";

const DEVICE_KEY = "xiaoban.deviceId";
const FALLBACK_URL = import.meta.env.VITE_HUB_URL ?? "ws://127.0.0.1:47100/ws";

function deviceId(): string {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY, created);
  return created;
}

async function endpoint(): Promise<string> {
  return isTauri() ? invoke<string>("hub_endpoint") : FALLBACK_URL;
}

const HubContext = createContext<HubStore | null>(null);

export function HubProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [store, setStore] = useState<HubStore | null>(null);
  const deviceName = t("device-desktop");

  useEffect(() => {
    let active = true;
    let created: HubStore | null = null;
    void endpoint().then((url) => {
      if (!active) return;
      const client = new HubClient({
        url,
        device: { deviceId: deviceId(), name: deviceName, platform: "desktop" },
        credential: { kind: "local" },
      });
      created = new HubStore(client);
      setStore(created);
      void client.connect();
    });
    return () => {
      active = false;
      created?.client.close();
    };
  }, [deviceName]);

  if (!store) return null;
  return <HubContext value={store}>{children}</HubContext>;
}

export function useHub(): HubStore {
  const store = use(HubContext);
  if (!store) throw new Error("useHub must be used inside HubProvider");
  return store;
}
