import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const KEY = "xiaoban.session";

export interface Session {
  url: string;
  deviceId: string;
  token: string;
}

export async function loadSession(): Promise<Session | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  return raw ? (JSON.parse(raw) as Session) : null;
}

export async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

export function newDeviceId(): string {
  return randomUUID();
}

export function hubUrl(address: string): string {
  const host = address
    .trim()
    .replace(/^wss?:\/\//, "")
    .replace(/\/ws$/, "");
  return `ws://${host.includes(":") ? host : `${host}:47100`}/ws`;
}
