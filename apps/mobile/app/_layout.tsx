import { I18nProvider } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { HubProvider } from "../src/hub/HubProvider.tsx";
import { Island } from "../src/hub/Island.tsx";
import { Notices } from "../src/hub/Notices.tsx";
import { PlanBall } from "../src/hub/PlanBall.tsx";
import { translator } from "../src/i18n.ts";

const { t } = translator;

export default function RootLayout() {
  return (
    <I18nProvider translator={translator}>
      <HubProvider>
        <Island />
        <Notices />
        <PlanBall />
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerStyle: { backgroundColor: color.ground },
            headerTintColor: color.ink,
            contentStyle: { backgroundColor: color.ground },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false, title: t("app-name") }} />
          <Stack.Screen
            name="setup"
            options={{ headerShown: false, title: t("onboarding-hello") }}
          />
          <Stack.Screen
            name="consent"
            options={{ headerShown: false, presentation: "modal", title: t("consent-title") }}
          />
          <Stack.Screen
            name="html/[id]"
            options={{ headerShown: false, title: t("html-view-title") }}
          />
          <Stack.Screen
            name="md/[id]"
            options={{ headerShown: false, title: t("md-card-untitled") }}
          />
          <Stack.Screen name="models" options={{ headerShown: false, title: t("models-title") }} />
          <Stack.Screen
            name="notify-settings"
            options={{ headerShown: false, title: t("notify-settings-title") }}
          />
          <Stack.Screen
            name="calendar-settings"
            options={{ headerShown: false, title: t("calendar-settings-title") }}
          />
          <Stack.Screen name="scan" options={{ headerShown: false, title: t("scan-title") }} />
          <Stack.Screen name="pair" options={{ headerShown: false, title: t("pair-title") }} />
          <Stack.Screen name="thread/[id]" options={{ headerShown: false, title: "" }} />
        </Stack>
      </HubProvider>
    </I18nProvider>
  );
}
