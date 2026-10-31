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

const QUESTIONS: readonly Question[] = [
  {
    ask: "meet-question-preferred-name",
    label: "memory-topic-preferred-name",
    replies: [],
  },
  {
    ask: "meet-question-home-and-work",
    label: "memory-topic-home-and-work",
    replies: ["meet-reply-pass"],
  },
  {
    ask: "meet-question-household",
    label: "memory-topic-household",
    replies: ["meet-reply-alone", "meet-reply-pass"],
  },
];

type Line =
  | { kind: "ask"; text: string }
  | { kind: "answer"; text: string }
  | { kind: "remembered"; text: string };

const PAUSE_MS = 450;

export function MeetStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const [lines, setLines] = useState<Line[]>([
    { kind: "ask", text: t("meet-question-preferred-name") },
  ]);
  const [index, setIndex] = useState(0);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLLIElement>(null);
  const question = QUESTIONS[index];

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  });

  const answer = async (text: string, pass: boolean) => {
    if (!question || typing) return;
    const value = text.trim();
    if (!value) return;
    setDraft("");
    setLines((current) => [...current, { kind: "answer", text: value }]);
    setTyping(true);
    if (!pass) {
      const memory = await store.remember(t(question.label), value);
      setLines((current) => [
        ...current,
        {
          kind: "remembered",
          text: t("meet-remembered", { topic: t(question.label), value: memory.value }),
        },
      ]);
    }
    const following = QUESTIONS[index + 1];
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    setLines((current) => [
      ...current,
      { kind: "ask", text: t(following ? following.ask : "meet-all-set") },
    ]);
    setIndex((current) => current + 1);
    setTyping(false);
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
          {typing && (
            <li className="meet-line meet-line--ask meet-line--typing" aria-hidden="true">
              <span />
              <span />
              <span />
            </li>
          )}
          <li ref={end} className="meet-step__end" aria-hidden="true" />
        </ol>
        {question && (
          <>
            {question.replies.length > 0 && (
              <div className="meet-step__replies">
                {question.replies.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    className="chip"
                    disabled={typing}
                    onClick={() => void answer(t(reply), reply === "meet-reply-pass")}
                  >
                    {t(reply)}
                  </button>
                ))}
              </div>
            )}
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
                disabled={typing}
              />
            </form>
          </>
        )}
      </div>
      <StepFooter
        onBack={onBack}
        skip={question ? { label: t("onboarding-skip"), onSkip: onDone } : undefined}
        next={{ label: t("onboarding-next"), onNext: onDone }}
      />
    </div>
  );
}
