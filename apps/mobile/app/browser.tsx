import type { BrowserAction, BrowserPage } from "@xiaoban/protocol";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { color } from "@xiaoban/tokens";
import * as Clipboard from "expo-clipboard";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { failedPage, registerBrowser } from "../src/browser/controller.ts";
import { PAGE_SCRIPT, runScript } from "../src/browser/pageScript.ts";
import { useHubStore } from "../src/hub/HubProvider.tsx";
import { shortToast } from "../src/hub/shortToast.ts";
import { openThread } from "../src/screens/ChatsTab.tsx";

const LOAD_WAIT_MS = 9000;
const SETTLE_MS = 900;
const IDLE_BANNER_MS = 2500;
const ASK_TEXT_LIMIT = 5000;

function hostOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

function Glyph({ d, size = 20, stroke = color.inkMid }: { d: string; size?: number; stroke?: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={d} />
    </Svg>
  );
}

export default function BrowserScreen() {
  const { url: start } = useLocalSearchParams<{ url?: string }>();
  const { t } = useI18n();
  const store = useHubStore();
  const { preferences } = useHubState(store);
  const insets = useSafeAreaInsets();
  const web = useRef<WebView>(null);
  const [source, setSource] = useState(start ?? "about:blank");
  const [url, setUrl] = useState(start ?? "");
  const [title, setTitle] = useState("");
  const [back, setBack] = useState(false);
  const [forward, setForward] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const loadWaiters = useRef<Array<() => void>>([]);
  const reply = useRef<((page: BrowserPage) => void) | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);

  const finishLoad = useCallback(() => {
    for (const wake of loadWaiters.current.splice(0)) wake();
  }, []);

  const loaded = useCallback(
    () =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, LOAD_WAIT_MS);
        loadWaiters.current.push(() => {
          clearTimeout(timer);
          setTimeout(resolve, SETTLE_MS);
        });
      }),
    [],
  );

  const ask = useCallback(
    (call: string) =>
      new Promise<BrowserPage>((resolve) => {
        const timer = setTimeout(() => {
          reply.current = null;
          resolve(failedPage("the page did not answer"));
        }, LOAD_WAIT_MS);
        reply.current = (page) => {
          clearTimeout(timer);
          reply.current = null;
          resolve(page);
        };
        web.current?.injectJavaScript(PAGE_SCRIPT + runScript(call));
      }),
    [],
  );

  const stepText = useCallback(
    (action: BrowserAction): string => {
      switch (action.kind) {
        case "open":
          return t("browser-step-open", { site: hostOf(action.url) });
        case "read":
          return t("browser-step-read");
        case "click":
          return t("browser-step-click");
        case "type":
          return t("browser-step-type");
        case "scroll":
          return t("browser-step-scroll");
        case "back":
          return t("browser-step-back");
      }
    },
    [t],
  );

  const perform = useCallback(
    async (action: BrowserAction): Promise<BrowserPage> => {
      if (stopped.current) return failedPage("the user stopped the browser");
      switch (action.kind) {
        case "open": {
          const wait = loaded();
          setSource(action.url);
          await wait;
          return ask("window.__xb.read()");
        }
        case "read":
          return ask("window.__xb.read()");
        case "click": {
          const wait = loaded();
          const page = await ask(`window.__xb.click(${action.index})`);
          if (page.error) return page;
          await Promise.race([wait, new Promise((resolve) => setTimeout(resolve, SETTLE_MS * 2))]);
          return ask("window.__xb.read()");
        }
        case "type":
          return ask(`window.__xb.type(${action.index}, ${JSON.stringify(action.text)})`);
        case "scroll":
          return ask(`window.__xb.scroll(${action.down})`);
        case "back": {
          const wait = loaded();
          web.current?.goBack();
          await wait;
          return ask("window.__xb.read()");
        }
      }
    },
    [ask, loaded],
  );

  const run = useCallback(
    (action: BrowserAction): Promise<BrowserPage> => {
      const job = chain.current.then(async () => {
        if (idle.current) clearTimeout(idle.current);
        setStep(stepText(action));
        const page = await perform(action);
        idle.current = setTimeout(() => setStep(null), IDLE_BANNER_MS);
        return page;
      });
      chain.current = job.catch(() => undefined);
      return job;
    },
    [perform, stepText],
  );

  useEffect(() => registerBrowser({ run }), [run]);

  useEffect(
    () => () => {
      if (idle.current) clearTimeout(idle.current);
    },
    [],
  );

  const stop = () => {
    stopped.current = true;
    setStep(null);
    reply.current?.(failedPage("the user stopped the browser"));
    void store.browserStop().catch(() => undefined);
    setTimeout(() => {
      stopped.current = false;
    }, 1500);
  };

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as { xb?: BrowserPage };
      if (data.xb) reply.current?.(data.xb);
    } catch {
      return;
    }
  };

  const askAbout = async () => {
    const page = await ask("window.__xb.read()");
    const primary = preferences?.primaryThreadId;
    if (!primary || page.error) return;
    const body = `${page.url}\n${page.title}\n\n${page.text.slice(0, ASK_TEXT_LIMIT)}`;
    void store
      .send(primary, t("browser-ask-prompt"), {
        context: [{ label: t("browser-ask-label", { title: page.title || hostOf(page.url) }), body }],
      })
      .catch(() => undefined);
    openThread(primary);
  };

  const controlled = step !== null;
  const bar = useMemo(() => ({ paddingBottom: Math.max(insets.bottom, 8) }), [insets.bottom]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable
          style={styles.icon}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t("chat-back")}
        >
          <Glyph d="M15 5l-7 7 7 7" size={22} stroke={color.ink} />
        </Pressable>
        <View style={styles.address}>
          <Text style={styles.addressText} numberOfLines={1}>
            {hostOf(url) || title}
          </Text>
        </View>
        <Pressable
          style={styles.icon}
          onPress={() => setMenu(!menu)}
          accessibilityRole="button"
          accessibilityLabel={t("chat-more")}
        >
          <Glyph d="M5 12h.01M12 12h.01M19 12h.01" stroke={color.ink} />
        </Pressable>
      </View>
      {menu ? (
        <View style={styles.menu}>
          <Pressable
            style={styles.menuRow}
            onPress={() => {
              setMenu(false);
              void Linking.openURL(url).catch(() => undefined);
            }}
          >
            <Text style={styles.menuText}>{t("browser-open-system")}</Text>
          </Pressable>
          <Pressable
            style={styles.menuRow}
            onPress={() => {
              setMenu(false);
              void Clipboard.setStringAsync(url).then(() => shortToast(t("browser-copied")));
            }}
          >
            <Text style={styles.menuText}>{t("browser-copy-link")}</Text>
          </Pressable>
        </View>
      ) : null}
      {controlled ? (
        <View style={styles.banner}>
          <View style={styles.dot} />
          <Text style={styles.bannerText} numberOfLines={1}>
            {t("browser-controlling", { step: step ?? "" })}
          </Text>
          <Pressable hitSlop={10} accessibilityRole="button" onPress={stop}>
            <Text style={styles.stop}>{t("browser-stop")}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.flex}>
        <WebView
          ref={web}
          style={styles.flex}
          source={{ uri: source }}
          originWhitelist={["https://*", "http://*"]}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          allowFileAccess={false}
          onMessage={onMessage}
          onNavigationStateChange={(state) => {
            setUrl(state.url);
            setTitle(state.title);
            setBack(state.canGoBack);
            setForward(state.canGoForward);
          }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => {
            setLoading(false);
            finishLoad();
          }}
        />
        {loading ? <View style={styles.progress} /> : null}
      </View>
      <View style={[styles.bar, bar]}>
        <Pressable
          style={styles.icon}
          disabled={!back}
          onPress={() => web.current?.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t("browser-back")}
        >
          <Glyph d="M15 5l-7 7 7 7" stroke={back ? color.inkMid : color.faint} />
        </Pressable>
        <Pressable
          style={styles.icon}
          disabled={!forward}
          onPress={() => web.current?.goForward()}
          accessibilityRole="button"
          accessibilityLabel={t("browser-forward")}
        >
          <Glyph d="M9 5l7 7-7 7" stroke={forward ? color.inkMid : color.faint} />
        </Pressable>
        <Pressable
          style={styles.icon}
          onPress={() => web.current?.reload()}
          accessibilityRole="button"
          accessibilityLabel={t("browser-reload")}
        >
          <Glyph d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" />
        </Pressable>
        <Pressable style={styles.askChip} accessibilityRole="button" onPress={() => void askAbout()}>
          <Text style={styles.askText}>{t("browser-ask")}</Text>
        </Pressable>
        <Pressable
          style={styles.icon}
          onPress={() => void Share.share({ message: url }).catch(() => undefined)}
          accessibilityRole="button"
          accessibilityLabel={t("browser-share")}
        >
          <Glyph d="M12 4v11M7 9l5-5 5 5M5 14v5h14v-5" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 6, gap: 4 },
  icon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  address: {
    flex: 1,
    height: 34,
    borderRadius: 17,
    backgroundColor: color.ground,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  addressText: { fontSize: 12, color: color.inkMid },
  menu: {
    position: "absolute",
    top: 96,
    right: 10,
    zIndex: 5,
    backgroundColor: color.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.line,
    paddingVertical: 4,
  },
  menuRow: { paddingHorizontal: 16, height: 40, justifyContent: "center" },
  menuText: { fontSize: 14, color: color.ink },
  banner: {
    marginHorizontal: 10,
    marginVertical: 6,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: 12,
    backgroundColor: color.ink,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: color.accent },
  bannerText: { flex: 1, fontSize: 12, color: color.surface },
  stop: { fontSize: 12, color: color.attention },
  progress: { position: "absolute", top: 0, left: 0, right: 0, height: 2, backgroundColor: color.accent },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderTopWidth: 1,
    borderTopColor: color.lineSoft,
    paddingTop: 6,
  },
  askChip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: color.accentSoft,
    justifyContent: "center",
  },
  askText: { fontSize: 13, color: color.accent },
});
