import type { AskQuestion, AskRequest } from "@xiaoban/protocol";
import { describe, expect, it } from "vitest";
import {
  advancesOnPick,
  answerOf,
  back,
  canSubmit,
  initialFlow,
  pick,
  record,
  summarize,
  toggleOther,
} from "./askFlow.ts";

const ask: AskRequest = {
  id: "a1",
  turnId: "t1",
  threadId: "th1",
  questions: [
    {
      text: "Which flight?",
      note: null,
      multiple: false,
      options: [
        { label: "A", note: null },
        { label: "B", note: "cheaper" },
      ],
    },
    {
      text: "Which days?",
      note: null,
      multiple: true,
      options: [
        { label: "Sat", note: null },
        { label: "Sun", note: null },
      ],
    },
    { text: "Ledger name?", note: null, multiple: false, options: [] },
  ],
};

const [single, multi, free] = ask.questions as [AskQuestion, AskQuestion, AskQuestion];

describe("ask flow", () => {
  it("only moves on by itself for single choice among several questions", () => {
    expect(advancesOnPick(ask, single)).toBe(true);
    expect(advancesOnPick(ask, multi)).toBe(false);
    expect(advancesOnPick(ask, free)).toBe(false);
    expect(advancesOnPick({ ...ask, questions: [single] }, single)).toBe(false);
  });

  it("single choice replaces, multiple toggles, and the other box clears picks", () => {
    let flow = pick(single, initialFlow(), "A");
    flow = pick(single, flow, "B");
    expect(flow.picked).toEqual(["B"]);

    flow = pick(multi, initialFlow(), "Sat");
    flow = pick(multi, flow, "Sun");
    flow = pick(multi, flow, "Sat");
    expect(flow.picked).toEqual(["Sun"]);
    expect(toggleOther(flow)).toMatchObject({ other: true, picked: [] });
  });

  it("needs a pick, except that picking nothing is a fair answer to a multiple question", () => {
    expect(canSubmit(single, initialFlow())).toBe(false);
    expect(canSubmit(multi, initialFlow())).toBe(true);
    expect(canSubmit(free, initialFlow())).toBe(false);
    expect(answerOf(free, { ...initialFlow(), text: " Home " })).toEqual({
      kind: "typed",
      text: "Home",
    });
  });

  it("records answers step by step and returns them all at the end", () => {
    let step = record(ask, initialFlow(), { kind: "chosen", labels: ["B"] });
    expect(step.done).toBeNull();
    expect(step.flow.step).toBe(1);
    step = record(ask, step.flow, { kind: "skipped" });
    expect(step.flow.step).toBe(2);
    step = record(ask, step.flow, { kind: "typed", text: "Home" });
    expect(step.done).toEqual([
      { kind: "chosen", labels: ["B"] },
      { kind: "skipped" },
      { kind: "typed", text: "Home" },
    ]);
  });

  it("going back restores what was answered", () => {
    const first = record(ask, initialFlow(), { kind: "chosen", labels: ["B"] });
    expect(back(ask, first.flow)).toMatchObject({ step: 0, picked: ["B"], other: false });
  });

  it("summarizes answers for the collapsed row", () => {
    expect(summarize({ kind: "chosen", labels: ["A", "B"] })).toBe("A · B");
    expect(summarize({ kind: "chosen", labels: [] })).toBe("");
    expect(summarize({ kind: "typed", text: "Home" })).toBe("Home");
    expect(summarize({ kind: "skipped" })).toBeNull();
  });
});
