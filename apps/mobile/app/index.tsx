import { color } from "@xiaoban/tokens";
import { Redirect } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useHubContext } from "../src/hub/HubProvider.tsx";
import { ChatsTab } from "../src/screens/ChatsTab.tsx";
import { DailyTab } from "../src/screens/DailyTab.tsx";
import { MeTab } from "../src/screens/MeTab.tsx";
import { SkillsTab } from "../src/screens/SkillsTab.tsx";
import { type Tab, TabBar } from "../src/ui/TabBar.tsx";

let remembered: Tab = "chats";

export default function HomeScreen() {
  const { phase, store } = useHubContext();
  const [tab, setTab] = useState<Tab>(remembered);
  if (phase === "loading") return <View style={styles.screen} />;
  if (phase === "unpaired" || !store) return <Redirect href="/pair" />;
  const change = (next: Tab) => {
    remembered = next;
    setTab(next);
  };
  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        {tab === "chats" && <ChatsTab store={store} />}
        {tab === "daily" && <DailyTab store={store} />}
        {tab === "skills" && <SkillsTab store={store} />}
        {tab === "me" && <MeTab store={store} />}
      </View>
      <TabBar current={tab} onChange={change} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  body: { flex: 1 },
});
