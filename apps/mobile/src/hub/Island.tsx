import { confirmText } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { useEffect, useRef } from "react";
import { XiaobanHub } from "../../modules/xiaoban-hub/index.ts";
import { useHubContext } from "./HubProvider.tsx";
import { useBackground } from "./useBackground.ts";

function Bridge({
  store,
  onComputer,
}: {
  store: NonNullable<ReturnType<typeof useHubContext>["store"]>;
  onComputer: boolean;
}) {
  const { t } = useI18n();
  const state = useHubState(store);
  const background = useBackground();
  const running = Object.values(state.drafts).find((draft) => !draft.failure) ?? null;
  const confirm = state.confirms[0] ?? null;
  const sent = useRef("");
  const last = useRef<{ turn: string | null; steps: number; title: string }>({
    turn: null,
    steps: 0,
    title: "",
  });
  const title = (threadId: string) =>
    state.threads.find((thread) => thread.id === threadId)?.title ?? t("app-name");

  useEffect(() => {
    const island = XiaobanHub?.island;
    if (!island) return;
    const push = (value: object) => {
      const next = JSON.stringify(value);
      if (next === sent.current) return;
      sent.current = next;
      island(next);
    };
    if (!background) {
      push({ mode: "hidden" });
      last.current = {
        turn: running?.turnId ?? null,
        steps: running?.steps.length ?? 0,
        title: "",
      };
      return;
    }
    if (confirm) {
      const text = confirmText(confirm, t);
      push({
        mode: "confirm",
        title: text.title,
        detail: text.detail ?? text.hint,
        open: t("island-open"),
        confirmId: confirm.id,
        route: onComputer ? "js" : "local",
        failed: t("island-answer-failed"),
        choices: text.choices.map((option) => ({
          choice: option.choice,
          label: option.label,
          primary: Boolean(option.primary),
        })),
      });
      return;
    }
    if (running) {
      const name = title(running.threadId);
      const steps = running.steps.length;
      if (last.current.turn === running.turnId && steps > last.current.steps) {
        push({
          mode: "row",
          n: steps,
          title: t("island-title", { title: name, n: steps }),
          detail: "",
        });
      } else if (last.current.turn !== running.turnId) {
        push({ mode: "compact", n: steps });
      }
      last.current = { turn: running.turnId, steps, title: name };
      return;
    }
    if (last.current.turn) {
      const title = t("island-done", {
        title: last.current.title || t("app-name"),
        count: last.current.steps,
      });
      if (!XiaobanHub?.turnDone(title)) push({ mode: "done", title });
      last.current = { turn: null, steps: 0, title: "" };
    }
  });
  return null;
}

export function Island() {
  const { store, onComputer } = useHubContext();
  if (!store || !XiaobanHub) return null;
  return <Bridge store={store} onComputer={onComputer} />;
}
