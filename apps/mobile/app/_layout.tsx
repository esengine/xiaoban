import { I18nProvider } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { HubProvider } from "../src/hub/HubProvider.tsx";
import { translator } from "../src/i18n.ts";

const { t } = translator;

export default function RootLayout() {
  return (
    <I18nProvider translator={translator}>
      <HubProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerStyle: { backgroundColor: color.ground },
            headerTintColor: color.ink,
            contentStyle: { backgroundColor: color.ground },
          }}
        >
          <Stack.Screen name="index" options={{ title: t("app-name") }} />
          <Stack.Screen name="pair" options={{ headerShown: false, title: t("pair-title") }} />
          <Stack.Screen name="thread/[id]" options={{ title: "" }} />
        </Stack>
      </HubProvider>
    </I18nProvider>
  );
}
