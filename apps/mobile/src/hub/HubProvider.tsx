import { HubClient, HubStore } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { Credential } from "@xiaoban/protocol";
import { createContext, type ReactNode, use, useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import {
  clearSession,
  hubUrl,
  loadSession,
  newDeviceId,
  type Session,
  saveSession,
} from "./session.ts";

type Phase = "loading" | "unpaired" | "ready";

interface HubContextValue {
  phase: Phase;
  store: HubStore | null;
  pair: (address: string, code: string) => Promise<void>;
  unpair: () => Promise<void>;
}

export class MissingDeviceToken extends Error {
  override readonly name = "MissingDeviceToken";
}

const HubContext = createContext<HubContextValue | null>(null);
const platform = Platform.OS === "ios" ? "ios" : "android";

export function HubProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>("loading");
  const [store, setStore] = useState<HubStore | null>(null);
  const deviceName = t(platform === "ios" ? "device-ios" : "device-android");

  const createStore = useCallback(
    (url: string, deviceId: string, credential: Credential) =>
      new HubStore(
        new HubClient({ url, device: { deviceId, name: deviceName, platform }, credential }),
      ),
    [deviceName],
  );

  useEffect(() => {
    void loadSession().then((session) => {
      if (!session) {
        setPhase("unpaired");
        return;
      }
      const restored = createStore(session.url, session.deviceId, {
        kind: "paired",
        token: session.token,
      });
      setStore(restored);
      setPhase("ready");
      void restored.client.connect();
    });
  }, [createStore]);

  useEffect(() => () => store?.client.close(), [store]);

  const pair = useCallback(
    async (address: string, code: string) => {
      const url = hubUrl(address);
      const deviceId = newDeviceId();
      const paired = createStore(url, deviceId, { kind: "pairing_code", code: code.trim() });
      const welcome = await paired.client.connect();
      if (!welcome.deviceToken) throw new MissingDeviceToken();
      const session: Session = { url, deviceId, token: welcome.deviceToken };
      await saveSession(session);
      setStore(paired);
      setPhase("ready");
    },
    [createStore],
  );

  const unpair = useCallback(async () => {
    store?.client.close();
    await clearSession();
    setStore(null);
    setPhase("unpaired");
  }, [store]);

  return <HubContext value={{ phase, store, pair, unpair }}>{children}</HubContext>;
}

export function useHubContext(): HubContextValue {
  const value = use(HubContext);
  if (!value) throw new Error("useHubContext must be used inside HubProvider");
  return value;
}

export function useHubStore(): HubStore {
  const { store } = useHubContext();
  if (!store) throw new Error("hub is not paired");
  return store;
}
