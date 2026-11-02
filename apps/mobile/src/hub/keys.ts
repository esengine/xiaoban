import { chacha20poly1305 } from "@noble/ciphers/chacha.js";
import { x25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import type { HubStore } from "@xiaoban/client";
import type { ModelInfo, ProviderId } from "@xiaoban/protocol";
import { getRandomBytes } from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const KEYS = "xiaoban.keys";
const NAMED = "xiaoban.named";
const NAMED_PREFIX = "named:";
const CONTEXT = new TextEncoder().encode("xiaoban provider keys v1");

export type Keys = Partial<Record<ProviderId, string>>;

export async function loadKeys(): Promise<Keys> {
  const raw = await SecureStore.getItemAsync(KEYS);
  return raw ? (JSON.parse(raw) as Keys) : {};
}

export async function saveKey(provider: ProviderId, key: string): Promise<Keys> {
  const keys = { ...(await loadKeys()), [provider]: key };
  await SecureStore.setItemAsync(KEYS, JSON.stringify(keys));
  return keys;
}

export type Named = Record<string, string>;

export async function loadNamed(): Promise<Named> {
  const raw = await SecureStore.getItemAsync(NAMED).catch(() => null);
  return raw ? (JSON.parse(raw) as Named) : {};
}

export async function saveNamed(name: string, value: string | null): Promise<void> {
  const named = await loadNamed();
  if (value === null) delete named[name];
  else named[name] = value;
  await SecureStore.setItemAsync(NAMED, JSON.stringify(named));
}

export function withNamed(keys: Keys, named: Named): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const [provider, key] of Object.entries(keys)) if (key) merged[provider] = key;
  for (const [name, value] of Object.entries(named)) merged[`${NAMED_PREFIX}${name}`] = value;
  return merged;
}

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function fromBase64(value: string): Uint8Array {
  const text = atob(value);
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
  return bytes;
}

export async function fetchKeys(
  remote: HubStore,
): Promise<{ keys: Keys; model: ModelInfo | null }> {
  const secret = getRandomBytes(32);
  const sealed = await remote.shareProviderKeys(toBase64(x25519.getPublicKey(secret)));
  const shared = x25519.getSharedSecret(secret, fromBase64(sealed.publicKey));
  const key = sha256(new Uint8Array([...CONTEXT, ...shared]));
  const plain = chacha20poly1305(key, fromBase64(sealed.nonce)).decrypt(
    fromBase64(sealed.ciphertext),
  );
  const received = JSON.parse(new TextDecoder().decode(plain)) as Keys;
  const keys = { ...(await loadKeys()), ...received };
  await SecureStore.setItemAsync(KEYS, JSON.stringify(keys));
  return { keys, model: sealed.model };
}
