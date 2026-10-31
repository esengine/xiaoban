import { HubClient, HubStore } from "@xiaoban/client";
import type { Credential } from "@xiaoban/protocol";
import { createContext, type ReactNode, use, useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { hubUrl, loadSession, newDeviceId, type Session, saveSession } from "./session.ts";

type Phase = "loading" | "unpaired" | "ready";

interface HubContextValue {
  phase: Phase;
  store: HubStore | null;
  pair: (address: string, code: string) => Promise<void>;
}

const HubContext = createContext<HubContextValue | null>(null);

function createStore(url: string, deviceId: string, credential: Credential): HubStore {
  const client = new HubClient({
    url,
    device: {
      deviceId,
      name: Platform.OS === "ios" ? "iPhone" : "安卓手机",
      platform: Platform.OS === "ios" ? "ios" : "android",
    },
    credential,
  });
  return new HubStore(client);
}

export function HubProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [store, setStore] = useState<HubStore | null>(null);

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
  }, []);

  useEffect(() => () => store?.client.close(), [store]);

  const pair = useCallback(async (address: string, code: string) => {
    const url = hubUrl(address);
    const deviceId = newDeviceId();
    const paired = createStore(url, deviceId, { kind: "pairing_code", code: code.trim() });
    const welcome = await paired.client.connect();
    if (!welcome.deviceToken) throw new Error("电脑没有返回配对凭证");
    const session: Session = { url, deviceId, token: welcome.deviceToken };
    await saveSession(session);
    setStore(paired);
    setPhase("ready");
  }, []);

  return <HubContext value={{ phase, store, pair }}>{children}</HubContext>;
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
