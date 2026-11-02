import * as SecureStore from "expo-secure-store";
import { XiaobanHub } from "../../modules/xiaoban-hub/index.ts";

export interface BackgroundStatus {
  notifications: boolean;
  battery: boolean;
  exactAlarms: boolean;
  xiaomi: boolean;
}

const ASKED = "xiaoban.background.asked";

export function backgroundStatus(): BackgroundStatus | null {
  return XiaobanHub?.backgroundStatus?.() ?? null;
}

export async function shouldAskBeforeBackground(): Promise<boolean> {
  const status = backgroundStatus();
  if (!status || status.battery) return false;
  const asked = await SecureStore.getItemAsync(ASKED).catch(() => null);
  return asked === null;
}

export async function markAsked(): Promise<void> {
  await SecureStore.setItemAsync(ASKED, "1").catch(() => undefined);
}

export function openBackgroundSetting(kind: "battery" | "autostart" | "alarms" | "notifications") {
  return XiaobanHub?.openBackgroundSetting?.(kind) ?? false;
}
