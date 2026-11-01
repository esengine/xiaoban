import { ToastAndroid } from "react-native";

export function shortToast(text: string) {
  ToastAndroid.show(text, ToastAndroid.SHORT);
}
