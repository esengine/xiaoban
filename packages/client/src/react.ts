import type { AskRequest } from "@xiaoban/protocol";
import { useCallback, useState, useSyncExternalStore } from "react";
import * as flowOf from "./askFlow.ts";
import type { HubState } from "./state.ts";
import type { HubStore } from "./store.ts";

export function useHubState(store: HubStore): HubState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export { draftsForThread } from "./state.ts";

export function useAskFlow(store: HubStore, ask: AskRequest) {
  const [flow, setFlow] = useState(flowOf.initialFlow);
  const question = ask.questions[Math.min(flow.step, ask.questions.length - 1)];
  const total = ask.questions.length;

  const advance = useCallback(
    (current: flowOf.AskFlow, answer: Parameters<typeof flowOf.record>[2]) => {
      const { flow: next, done } = flowOf.record(ask, current, answer);
      if (!done) {
        setFlow(next);
        return;
      }
      setFlow({ ...next, sent: true });
      store.answerAsk(ask.id, done).catch(() => setFlow({ ...next, sent: false }));
    },
    [ask, store],
  );

  return {
    flow,
    question,
    total,
    canSubmit: question ? flowOf.canSubmit(question, flow) : false,
    pick(label: string) {
      if (!question || flow.sent) return;
      const next = flowOf.pick(question, flow, label);
      if (flowOf.advancesOnPick(ask, question)) advance(next, flowOf.answerOf(question, next));
      else setFlow(next);
    },
    toggleOther: () => setFlow((current) => flowOf.toggleOther(current)),
    setText: (text: string) => setFlow((current) => flowOf.setText(current, text)),
    submit() {
      if (!question || flow.sent || !flowOf.canSubmit(question, flow)) return;
      advance(flow, flowOf.answerOf(question, flow));
    },
    skip() {
      if (flow.sent) return;
      advance(flow, { kind: "skipped" });
    },
    none() {
      if (flow.sent) return;
      advance({ ...flow, picked: [], other: false }, { kind: "chosen", labels: [] });
    },
    back: () => setFlow((current) => flowOf.back(ask, current)),
  };
}
