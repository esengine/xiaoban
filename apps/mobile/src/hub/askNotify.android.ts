import * as SecureStore from "expo-secure-store";
import { PermissionsAndroid, Platform } from "react-native";

const ASKED = "xiaoban.asked-notify";
const NEEDS_ASKING = 33;

export async function askNotifyOnce(): Promise<void> {
  if (Number(Platform.Version) < NEEDS_ASKING) return;
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (await PermissionsAndroid.check(permission)) return;
  if (await SecureStore.getItemAsync(ASKED)) return;
  await SecureStore.setItemAsync(ASKED, "1");
  await PermissionsAndroid.request(permission);
}
