import { describeError, failureKey } from "@xiaoban/client";
import type { PlainMessageKey } from "@xiaoban/i18n";
import { useI18n } from "@xiaoban/i18n/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useHub } from "../../../app/hub.tsx";
import { StepFooter } from "../StepFooter.tsx";

interface Question {
  ask: PlainMessageKey;
  label: PlainMessageKey;
  replies: PlainMessageKey[];
}

const PASS: PlainMessageKey = "meet-reply-pass";

const QUESTIONS: readonly Question[] = [
  {
    ask: "meet-question-preferred-name",
    label: "memory-topic-preferred-name",
    replies: [PASS],
  },
  {
    ask: "meet-question-home-and-work",
    label: "memory-topic-home-and-work",
    replies: [PASS],
  },
  {
    ask: "meet-question-household",
    label: "memory-topic-household",
    replies: ["meet-reply-alone", PASS],
  },
];

type Line =
  | { kind: "ask"; text: string }
  | { kind: "answer"; text: string }
  | { kind: "remembered"; text: string };

const PAUSE_MS = 450;

const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

export function MeetStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const [lines, setLines] = useState<Line[]>(() => [
    { kind: "ask", text: t("meet-intro") },
    { kind: "ask", text: t("meet-question-preferred-name") },
  ]);
  const [index, setIndex] = useState(0);
  const [reading, setReading] = useState(false);
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLLIElement>(null);
  const question = QUESTIONS[index];

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  });

  const say = (line: Line) => setLines((current) => [...current, line]);

  const advance = async () => {
    await pause();
    const following = QUESTIONS[index + 1];
    say({ kind: "ask", text: t(following ? following.ask : "meet-all-set") });
    setIndex((current) => current + 1);
  };

  const interpret = async (current: Question, answer: string): Promise<boolean> => {
    const topic = t(current.label);
    try {
      const { memory, reply, failure } = await store.interpretAnswer({
        subject: topic,
        question: t(current.ask),
        answer,
      });
      if (memory) {
        say({ kind: "remembered", text: t("meet-remembered", { topic, value: memory.value }) });
        return true;
      }
      const text = failure
        ? t("meet-failed", { reason: t(failureKey(failure.kind)) })
        : (reply ?? t("meet-unclear"));
      say({ kind: "ask", text });
    } catch (error) {
      say({ kind: "ask", text: t("meet-failed", { reason: t(describeError(error)) }) });
    }
    return false;
  };

  const answer = async (text: string, pass: boolean) => {
    const value = text.trim();
    if (!question || reading || !value) return;
    setDraft("");
    say({ kind: "answer", text: value });
    setReading(true);
    const understood = pass || (await interpret(question, value));
    if (understood) await advance();
    setReading(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void answer(draft, false);
  };

  return (
    <div className="step">
      <div className="step__body meet-step">
        <ol className="meet-step__chat" aria-live="polite">
          {lines.map((line, position) => (
            <li key={`${line.kind}-${position}`} className={`meet-line meet-line--${line.kind}`}>
              {line.text}
            </li>
          ))}
          {reading && (
            <li
              className="meet-line meet-line--ask meet-line--typing"
              aria-label={t("meet-reading")}
            >
              <span />
              <span />
              <span />
            </li>
          )}
          <li ref={end} className="meet-step__end" aria-hidden="true" />
        </ol>
        {question && (
          <>
            <div className="meet-step__replies">
              {question.replies.map((reply) => (
                <button
                  key={reply}
                  type="button"
                  className="chip"
                  disabled={reading}
                  onClick={() => void answer(t(reply), reply === PASS)}
                >
                  {t(reply)}
                </button>
              ))}
            </div>
            <form className="meet-step__composer" onSubmit={submit}>
              <label className="visually-hidden" htmlFor="meet-answer">
                {t("meet-input-placeholder")}
              </label>
              <input
                id="meet-answer"
                className="input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={t("meet-input-placeholder")}
                autoComplete="off"
                disabled={reading}
              />
            </form>
          </>
        )}
        <div className="meet-step__spacer" />
        <div className="meet-step__progress">
          <span className="meet-step__dots" aria-hidden="true">
            {QUESTIONS.map((item, position) => (
              <span key={item.ask} data-done={position <= index || undefined} />
            ))}
          </span>
          {t("meet-progress", {
            current: Math.min(index + 1, QUESTIONS.length),
            total: QUESTIONS.length,
          })}
        </div>
      </div>
      <StepFooter
        onBack={onBack}
        skip={question ? { label: t("onboarding-skip"), onSkip: onDone } : undefined}
        next={{ label: t("onboarding-next"), onNext: onDone }}
      />
    </div>
  );
}
