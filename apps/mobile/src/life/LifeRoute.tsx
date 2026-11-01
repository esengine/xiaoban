import type { HubStore } from "@xiaoban/client";
import { color } from "@xiaoban/tokens";
import { Redirect, Stack } from "expo-router";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { useHubContext } from "../hub/HubProvider.tsx";

export function LifeRoute({
  dark = false,
  children,
}: {
  dark?: boolean;
  children: (store: HubStore) => ReactNode;
}) {
  const { phase, store } = useHubContext();
  const ground = { backgroundColor: dark ? color.ink : color.ground };
  return (
    <>
      <Stack.Screen options={{ headerShown: false, contentStyle: ground }} />
      {phase === "loading" ? (
        <View style={[styles.screen, ground]} />
      ) : !store ? (
        <Redirect href="/pair" />
      ) : (
        <KeyboardAvoidingView style={[styles.screen, ground]} behavior="padding">
          {children(store)}
        </KeyboardAvoidingView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
