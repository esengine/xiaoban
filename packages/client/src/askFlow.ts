import type { AskAnswer, AskQuestion, AskRequest } from "@xiaoban/protocol";

export interface AskFlow {
  step: number;
  answers: AskAnswer[];
  picked: string[];
  other: boolean;
  text: string;
  sent: boolean;
}

export const OTHER_KEY = "__other__";

export function initialFlow(): AskFlow {
  return { step: 0, answers: [], picked: [], other: false, text: "", sent: false };
}

export function typesOnly(question: AskQuestion): boolean {
  return question.options.length === 0;
}

function restore(question: AskQuestion | undefined, answer: AskAnswer | undefined) {
  if (!question || !answer) return { picked: [], other: false, text: "" };
  if (answer.kind === "chosen") return { picked: answer.labels, other: false, text: "" };
  if (answer.kind === "typed")
    return { picked: [], other: !typesOnly(question), text: answer.text };
  return { picked: [], other: false, text: "" };
}

export function canSubmit(question: AskQuestion, flow: AskFlow): boolean {
  if (typesOnly(question) || flow.other) return flow.text.trim().length > 0;
  return flow.picked.length > 0 || question.multiple;
}

export function answerOf(question: AskQuestion, flow: AskFlow): AskAnswer {
  if (typesOnly(question) || flow.other) return { kind: "typed", text: flow.text.trim() };
  return { kind: "chosen", labels: flow.picked };
}

/** Choosing one option moves straight on only when there are several questions to get through. */
export function advancesOnPick(ask: AskRequest, question: AskQuestion): boolean {
  return ask.questions.length > 1 && !question.multiple && !typesOnly(question);
}

export function pick(question: AskQuestion, flow: AskFlow, label: string): AskFlow {
  if (question.multiple) {
    const picked = flow.picked.includes(label)
      ? flow.picked.filter((item) => item !== label)
      : [...flow.picked, label];
    return { ...flow, picked, other: false };
  }
  return { ...flow, picked: [label], other: false };
}

export function toggleOther(flow: AskFlow): AskFlow {
  return { ...flow, other: !flow.other, picked: [] };
}

export function setText(flow: AskFlow, text: string): AskFlow {
  return { ...flow, text };
}

/** Records this step's answer and moves on; `done` once every question has one. */
export function record(
  ask: AskRequest,
  flow: AskFlow,
  answer: AskAnswer,
): { flow: AskFlow; done: AskAnswer[] | null } {
  const answers = [...flow.answers.slice(0, flow.step), answer];
  if (flow.step + 1 >= ask.questions.length) {
    return { flow: { ...flow, answers }, done: answers };
  }
  const next = flow.step + 1;
  return {
    flow: { ...flow, answers, step: next, ...restore(ask.questions[next], flow.answers[next]) },
    done: null,
  };
}

export function back(ask: AskRequest, flow: AskFlow): AskFlow {
  if (flow.step === 0) return flow;
  const previous = flow.step - 1;
  return {
    ...flow,
    step: previous,
    ...restore(ask.questions[previous], flow.answers[previous]),
  };
}

/** The words to show for an answer; `null` when the user skipped it, `""` when they picked nothing. */
export function summarize(answer: AskAnswer): string | null {
  if (answer.kind === "chosen") return answer.labels.join(" · ");
  if (answer.kind === "typed") return answer.text;
  return null;
}
