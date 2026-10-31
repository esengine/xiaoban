import { color } from "@xiaoban/tokens";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { HubProvider } from "../src/hub/HubProvider.tsx";

export default function RootLayout() {
  return (
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
        <Stack.Screen name="index" options={{ title: "小伴" }} />
        <Stack.Screen name="pair" options={{ title: "连接家里的电脑" }} />
        <Stack.Screen name="thread/[id]" options={{ title: "" }} />
      </Stack>
    </HubProvider>
  );
}
