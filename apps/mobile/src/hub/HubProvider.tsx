import { HubClient, HubStore } from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { Credential, ProviderId } from "@xiaoban/protocol";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { XiaobanHub } from "../../modules/xiaoban-hub/index.ts";
import { fetchKeys, type Keys, loadKeys, saveKey } from "./keys.ts";
import {
  clearSession,
  hubUrl,
  loadSession,
  localDeviceId,
  newDeviceId,
  type Session,
  saveSession,
} from "./session.ts";

type Phase = "loading" | "unpaired" | "setup" | "ready";

interface HubContextValue {
  phase: Phase;
  store: HubStore | null;
  local: HubStore | null;
  onComputer: boolean;
  pair: (address: string, code: string) => Promise<void>;
  unpair: () => Promise<void>;
  keySaved: (provider: ProviderId, key: string) => Promise<void>;
}

export class MissingDeviceToken extends Error {
  override readonly name = "MissingDeviceToken";
}

const HubContext = createContext<HubContextValue | null>(null);
const platform = Platform.OS === "ios" ? "ios" : "android";

async function startLocal(locale: string, keys: Keys, name: string): Promise<number | null> {
  if (!XiaobanHub) return null;
  try {
    const port = await XiaobanHub.start(locale, JSON.stringify(keys), name);
    return port > 0 ? port : null;
  } catch {
    return null;
  }
}

export function HubProvider({ children }: { children: ReactNode }) {
  const { t, locale } = useI18n();
  const [loaded, setLoaded] = useState(false);
  const [local, setLocal] = useState<HubStore | null>(null);
  const [remote, setRemote] = useState<HubStore | null>(null);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [keys, setKeys] = useState<Keys>({});
  const deviceName = t(platform === "ios" ? "device-ios" : "device-android");
  const localRef = useRef<HubStore | null>(null);

  const createStore = useCallback(
    (url: string, deviceId: string, credential: Credential) =>
      new HubStore(
        new HubClient({ url, device: { deviceId, name: deviceName, platform }, credential }),
      ),
    [deviceName],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [session, stored] = await Promise.all([loadSession(), loadKeys()]);
      const port = await startLocal(locale, stored, deviceName);
      if (cancelled) return;
      setKeys(stored);
      if (port !== null) {
        const store = createStore(`ws://127.0.0.1:${port}/ws`, await localDeviceId(), {
          kind: "local",
        });
        localRef.current = store;
        setLocal(store);
        void store.client.connect().catch(() => undefined);
      }
      if (session) {
        const store = createStore(session.url, session.deviceId, {
          kind: "paired",
          token: session.token,
        });
        setRemote(store);
        void store.client.connect().catch(() => undefined);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [createStore, deviceName, locale]);

  useEffect(() => () => local?.client.close(), [local]);
  useEffect(() => () => remote?.client.close(), [remote]);

  useEffect(() => {
    if (!remote) {
      setRemoteOpen(false);
      return;
    }
    setRemoteOpen(remote.client.status === "open");
    return remote.client.onStatus((status) => setRemoteOpen(status === "open"));
  }, [remote]);

  useEffect(() => {
    if (!remote || !remoteOpen || !localRef.current) return;
    void fetchKeys(remote)
      .then(async ({ keys: synced, model }) => {
        setKeys(synced);
        const key = model ? synced[model.provider] : undefined;
        if (!model || !key) return;
        await localRef.current?.configureProvider({
          provider: model.provider,
          apiKey: key,
          model: model.model,
          ...(model.baseUrl ? { baseUrl: model.baseUrl } : {}),
          ...(model.label ? { label: model.label } : {}),
          api: model.api,
        });
      })
      .catch(() => undefined);
  }, [remote, remoteOpen]);

  const pair = useCallback(
    async (address: string, code: string) => {
      const url = hubUrl(address);
      const deviceId = newDeviceId();
      const paired = createStore(url, deviceId, { kind: "pairing_code", code: code.trim() });
      const welcome = await paired.client.connect();
      if (!welcome.deviceToken) throw new MissingDeviceToken();
      const session: Session = { url, deviceId, token: welcome.deviceToken };
      await saveSession(session);
      setRemote(paired);
    },
    [createStore],
  );

  const unpair = useCallback(async () => {
    remote?.client.close();
    await clearSession();
    setRemote(null);
  }, [remote]);

  const keySaved = useCallback(async (provider: ProviderId, key: string) => {
    setKeys(await saveKey(provider, key));
  }, []);

  const onComputer = remote !== null && (remoteOpen || local === null);
  const store = onComputer ? remote : (local ?? remote);
  const phase: Phase = !loaded
    ? "loading"
    : store === null
      ? "unpaired"
      : !onComputer && Object.keys(keys).length === 0
        ? "setup"
        : "ready";

  return (
    <HubContext value={{ phase, store, local, onComputer, pair, unpair, keySaved }}>
      {children}
    </HubContext>
  );
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
