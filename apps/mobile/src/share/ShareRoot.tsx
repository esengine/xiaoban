import { I18nProvider } from "@xiaoban/i18n/react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { HubProvider } from "../hub/HubProvider.tsx";
import { translator } from "../i18n.ts";
import { ShareSheet } from "./ShareSheet.tsx";

export function ShareRoot() {
  return (
    <SafeAreaProvider>
      <I18nProvider translator={translator}>
        <HubProvider>
          <ShareSheet />
        </HubProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
