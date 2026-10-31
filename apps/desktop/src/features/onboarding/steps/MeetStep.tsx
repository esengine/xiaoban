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
  locatable?: boolean;
}

const PASS: PlainMessageKey = "meet-reply-pass";
const GUESS_REPLIES: readonly PlainMessageKey[] = [
  "meet-reply-guess-right",
  "meet-reply-guess-wrong",
];

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
    locatable: true,
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
  | { kind: "remembered"; text: string }
  | { kind: "located"; place: string; text: string }
  | { kind: "note"; text: string };

type Reading = "answer" | "location" | null;

function Pin() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0114 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

function Dots() {
  return (
    <span className="meet-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

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
  const [reading, setReading] = useState<Reading>(null);
  const [draft, setDraft] = useState("");
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [guessing, setGuessing] = useState(false);
  const end = useRef<HTMLLIElement>(null);
  const question = QUESTIONS[index];

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  });

  const say = (line: Line) => setLines((current) => [...current, line]);

  const ask = (text: string, guess = false) => {
    setFollowUp(text);
    setGuessing(guess);
    say({ kind: "ask", text });
  };

  const advance = async () => {
    setFollowUp(null);
    setGuessing(false);
    await pause();
    const following = QUESTIONS[index + 1];
    say({ kind: "ask", text: t(following ? following.ask : "meet-all-set") });
    setIndex((current) => current + 1);
  };

  const locate = async () => {
    setReading("location");
    try {
      const location = await store.locate();
      if (location.status === "found") {
        const place = location.district
          ? t("location-place", { city: location.city, district: location.district })
          : location.city;
        const text = t("meet-location-guess", { place });
        setFollowUp(text);
        setGuessing(true);
        say({ kind: "located", place, text });
        say({ kind: "note", text: t("meet-location-note") });
        return;
      }
    } catch {}
    ask(t("meet-location-missing"));
  };

  const interpret = async (current: Question, answer: string): Promise<boolean> => {
    const topic = t(current.label);
    try {
      const result = await store.interpretAnswer({
        subject: topic,
        question: t(current.ask),
        answer,
        followUp,
        canLocate: current.locatable === true,
      });
      switch (result.outcome) {
        case "remembered":
          say({
            kind: "remembered",
            text: t("meet-remembered", { topic, value: result.memory.value }),
          });
          return true;
        case "declined":
          return true;
        case "locate":
          await locate();
          return false;
        case "unclear":
          ask(result.reply ?? t("meet-unclear"));
          return false;
        case "failed":
          say({
            kind: "ask",
            text: t("meet-failed", { reason: t(failureKey(result.failure.kind)) }),
          });
          return false;
      }
    } catch (error) {
      say({ kind: "ask", text: t("meet-failed", { reason: t(describeError(error)) }) });
      return false;
    }
  };

  const answer = async (text: string, pass: boolean) => {
    const value = text.trim();
    if (!question || reading || !value) return;
    setDraft("");
    say({ kind: "answer", text: value });
    setReading("answer");
    const settled = pass || (await interpret(question, value));
    if (settled) await advance();
    setReading(null);
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
              {line.kind === "located" && (
                <span className="meet-line__place">
                  <Pin />
                  {line.place}
                </span>
              )}
              {line.text}
            </li>
          ))}
          {reading === "answer" && (
            <li
              className="meet-line meet-line--ask meet-line--typing"
              aria-label={t("meet-reading")}
            >
              <Dots />
            </li>
          )}
          {reading === "location" && (
            <li className="meet-line meet-line--ask meet-line--locating">
              <span className="meet-line__pin">
                <Pin />
              </span>
              {t("meet-locating")}
              <Dots />
            </li>
          )}
          <li ref={end} className="meet-step__end" aria-hidden="true" />
        </ol>
        {question && (
          <>
            <div className="meet-step__replies">
              {(guessing ? [...GUESS_REPLIES, PASS] : question.replies).map((reply, position) => (
                <button
                  key={reply}
                  type="button"
                  className={guessing && position === 0 ? "chip chip--primary" : "chip"}
                  disabled={reading !== null}
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
                disabled={reading !== null}
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
