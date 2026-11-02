import { router } from "expo-router";
import { useEffect } from "react";
import { useHubContext } from "../hub/HubProvider.tsx";
import { activeBrowser, browserReady, failedPage } from "./controller.ts";

const OPEN_WAIT_MS = 8000;

export function BrowserBridge() {
  const { store } = useHubContext();

  useEffect(() => {
    if (!store) return;
    return store.client.onEvent((event) => {
      if (event.type !== "browser_command") return;
      const { id, action } = event;
      void (async () => {
        let handle = activeBrowser();
        if (!handle && action.kind === "open") {
          router.push({ pathname: "/browser", params: { url: action.url } });
          handle = await browserReady(OPEN_WAIT_MS);
        }
        const page = handle
          ? await handle.run(action).catch(() => failedPage("the browser could not do that"))
          : failedPage("the browser is not open; open a page first");
        await store.browserResult(id, page).catch(() => undefined);
      })();
    });
  }, [store]);

  return null;
}
