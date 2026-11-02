import { useI18n } from "@xiaoban/i18n/react";
import type { ConfirmChoice, TodoAction } from "@xiaoban/protocol";
import { useEffect } from "react";
import { AppState } from "react-native";
import { XiaobanHub } from "../../modules/xiaoban-hub/index.ts";
import { useHubContext } from "./HubProvider.tsx";
import { noticeTexts } from "./noticeText.ts";

type Answer =
  | { kind: "confirm"; confirmId: string; choice: ConfirmChoice }
  | { kind: "reply"; threadId: string; text: string }
  | { kind: "todo"; todoId: string; action: TodoAction };

function parse(raw: string): Answer | null {
  try {
    const value = JSON.parse(raw) as Answer;
    return value.kind === "confirm" || value.kind === "reply" || value.kind === "todo"
      ? value
      : null;
  } catch {
    return null;
  }
}

export function Notices() {
  const { t } = useI18n();
  const { store, onComputer } = useHubContext();

  useEffect(() => {
    const native = XiaobanHub;
    if (!native) return;
    native.setForeground(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (next) =>
      native.setForeground(next === "active"),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const native = XiaobanHub;
    if (!native || !store || !onComputer) return;
    const off = store.client.onEvent((event) => {
      if (event.type === "notice_withdrawn") {
        native.withdrawNotice(event.id);
        return;
      }
      if (event.type !== "notify") return;
      const { notice } = event;
      if (notice.level !== "now" || notice.ring !== "everywhere") return;
      if (AppState.currentState === "active") return;
      native.notify(
        JSON.stringify({
          op: "notify",
          route: "js",
          notice,
          texts: noticeTexts(t, notice.category),
        }),
      );
    });
    const answers = native.addListener("onNoticeAnswer", ({ answer }) => {
      const parsed = parse(answer);
      if (!parsed) return;
      if (parsed.kind === "confirm") {
        void store.answerConfirm(parsed.confirmId, parsed.choice).catch(() => undefined);
      } else if (parsed.kind === "todo") {
        void store.todoAction(parsed.todoId, parsed.action).catch(() => undefined);
      } else {
        void store.send(parsed.threadId, parsed.text).catch(() => undefined);
      }
    });
    return () => {
      off();
      answers.remove();
    };
  }, [store, onComputer, t]);

  return null;
}
