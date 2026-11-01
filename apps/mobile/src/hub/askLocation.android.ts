import * as SecureStore from "expo-secure-store";
import { PermissionsAndroid } from "react-native";

const ASKED = "xiaoban.asked-location";

export async function askLocationOnce(): Promise<void> {
  const permission = PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION;
  if (await PermissionsAndroid.check(permission)) return;
  if (await SecureStore.getItemAsync(ASKED)) return;
  await SecureStore.setItemAsync(ASKED, "1");
  await PermissionsAndroid.request(permission);
}
