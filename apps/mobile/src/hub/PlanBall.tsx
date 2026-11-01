import type { HubStore } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { useEffect, useRef } from "react";
import { XiaobanHub } from "../../modules/xiaoban-hub/index.ts";
import { ballState } from "../chat/planText.ts";
import { useHubContext } from "./HubProvider.tsx";
import { loadPlanBall, planBallSupported, setPlanBall, usePlanBall } from "./planBallStore.ts";
import { useBackground } from "./useBackground.ts";

type BallAction =
  | { kind: "choose"; threadId: string; option: string }
  | { kind: "closed"; threadId: string }
  | { kind: "restore"; threadId: string };

function parse(raw: string): BallAction | null {
  try {
    const value = JSON.parse(raw) as BallAction;
    return typeof value.threadId === "string" ? value : null;
  } catch {
    return null;
  }
}

function Bridge({ store }: { store: HubStore }) {
  const { t } = useI18n();
  const state = useHubState(store);
  const background = useBackground();
  const threadId = usePlanBall();
  const sent = useRef("");
  const plan = threadId ? state.plans[threadId] : undefined;

  useEffect(() => loadPlanBall(), []);

  useEffect(() => {
    if (threadId && state.status === "open") void store.loadPlan(threadId).catch(() => undefined);
  }, [store, threadId, state.status]);

  useEffect(() => {
    if (threadId && plan === null) setPlanBall(null);
  }, [threadId, plan]);

  useEffect(() => {
    const push = XiaobanHub?.planBall;
    if (!push) return;
    const value =
      background && plan && plan.status !== "done" ? ballState(t, plan) : { mode: "hidden" };
    const next = JSON.stringify(value);
    if (next === sent.current) return;
    sent.current = next;
    push(next);
  });

  useEffect(() => {
    const native = XiaobanHub;
    if (!native) return;
    const subscription = native.addListener("onPlanBall", ({ action }) => {
      const parsed = parse(action);
      if (!parsed) return;
      if (parsed.kind === "choose") {
        void store
          .planAction(parsed.threadId, { kind: "choose", option: parsed.option })
          .catch(() => undefined);
      } else if (parsed.kind === "closed") {
        setPlanBall(null);
      } else {
        setPlanBall(parsed.threadId);
      }
    });
    return () => subscription.remove();
  }, [store]);

  return null;
}

export function PlanBall() {
  const { store } = useHubContext();
  if (!store || !planBallSupported) return null;
  return <Bridge store={store} />;
}
