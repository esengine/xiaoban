import { cssVariables } from "@xiaoban/tokens";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";
import { HubProvider } from "./app/hub.tsx";
import "./styles.css";

const tokens = document.createElement("style");
tokens.textContent = cssVariables();
document.head.append(tokens);

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

createRoot(root).render(
  <StrictMode>
    <HubProvider>
      <App />
    </HubProvider>
  </StrictMode>,
);
