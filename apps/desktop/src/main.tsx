import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { createTranslator, negotiateLocale } from "@xiaoban/i18n";
import { I18nProvider } from "@xiaoban/i18n/react";
import { cssVariables } from "@xiaoban/tokens";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";
import { HubProvider } from "./app/hub.tsx";
import { Island, IslandSlot } from "./features/island/Island.tsx";
import "./features/island/island.css";
import "./styles.css";

const translator = createTranslator(negotiateLocale(navigator.languages));
const title = translator.t("app-name");
const label = isTauri() ? getCurrentWindow().label : "main";
const island = label === "island" || label === "island-slot";
document.documentElement.lang = translator.locale;
document.documentElement.dataset.window = island ? "island" : "main";
document.title = title;
if (isTauri() && !island) void getCurrentWindow().setTitle(title);

const tokens = document.createElement("style");
tokens.textContent = cssVariables();
document.head.append(tokens);

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

createRoot(root).render(
  <StrictMode>
    {label === "island-slot" ? (
      <IslandSlot />
    ) : (
      <I18nProvider translator={translator}>
        <HubProvider window={island ? "island" : "main"}>
          {island ? <Island /> : <App />}
        </HubProvider>
      </I18nProvider>
    )}
  </StrictMode>,
);
