import { summarizeAnswer } from "@xiaoban/client";
import { useAskFlow } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { AskAnswer, AskRequest } from "@xiaoban/protocol";
import type { KeyboardEvent } from "react";
import { useHub } from "../../app/hub.tsx";

export function AskCard({ ask }: { ask: AskRequest }) {
  const { t } = useI18n();
  const store = useHub();
  const flow = useAskFlow(store, ask);
  const { question, total } = flow;
  if (!question) return null;
  const typing = question.options.length === 0 || flow.flow.other;
  const many = total > 1;
  const submitLabel = typing
    ? t("ask-submit-text")
    : question.multiple
      ? t("ask-submit-multi", { count: flow.flow.picked.length })
      : t("ask-submit-single");

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    const inField = target instanceof HTMLInputElement;
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      if (flow.canSubmit && (inField || !(target instanceof HTMLButtonElement))) {
        event.preventDefault();
        flow.submit();
      }
      return;
    }
    if (inField) return;
    const index = Number(event.key) - 1;
    const option = question.options[index];
    if (option && /^[1-9]$/.test(event.key)) {
      event.preventDefault();
      flow.pick(option.label);
    }
  };

  return (
    <section className="ask-card" aria-label={t("ask-title")} onKeyDown={onKeyDown}>
      <header className="ask-card__head">
        <span className="ask-card__dot" aria-hidden="true" />
        <span>{total === 1 ? t("ask-title-waiting") : t("ask-title")}</span>
        {many && (
          <span className="ask-card__steps">
            <span className="ask-card__bars" aria-hidden="true">
              {ask.questions.map((item, index) => (
                <i key={item.text} data-on={index <= flow.flow.step || undefined} />
              ))}
            </span>
            {t("ask-step", { current: flow.flow.step + 1, total })}
          </span>
        )}
      </header>
      <div className="ask-card__body">
        <h3 className="ask-card__question">
          {question.text}
          {question.multiple && <small>{t("ask-multiple-hint")}</small>}
        </h3>
        {question.note && <p className="ask-card__note">{question.note}</p>}
        {question.options.length > 0 && (
          <div className="ask-card__options">
            {question.options.map((option, index) => {
              const on = flow.flow.picked.includes(option.label);
              return (
                <button
                  key={option.label}
                  type="button"
                  className="ask-option"
                  aria-pressed={on}
                  data-on={on || undefined}
                  data-multiple={question.multiple || undefined}
                  disabled={flow.flow.sent}
                  onClick={() => flow.pick(option.label)}
                >
                  <span className="ask-option__mark" aria-hidden="true">
                    {question.multiple && (
                      <svg aria-hidden="true" viewBox="0 0 24 24">
                        <path d="M5 12l5 5 9-10" />
                      </svg>
                    )}
                  </span>
                  <span className="ask-option__text">
                    <b>{option.label}</b>
                    {option.note && <small>{option.note}</small>}
                  </span>
                  {!question.multiple && index < 9 && <kbd>{index + 1}</kbd>}
                </button>
              );
            })}
            <button
              type="button"
              className="ask-option ask-option--other"
              aria-pressed={flow.flow.other}
              data-on={flow.flow.other || undefined}
              disabled={flow.flow.sent}
              onClick={flow.toggleOther}
            >
              <span className="ask-option__pen" aria-hidden="true">
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3" />
                </svg>
              </span>
              <span className="ask-option__text">{t("ask-other")}</span>
            </button>
          </div>
        )}
        {typing && (
          <input
            className="ask-card__input"
            value={flow.flow.text}
            placeholder={
              question.options.length === 0 ? t("ask-type-placeholder") : t("ask-other-placeholder")
            }
            aria-label={question.text}
            disabled={flow.flow.sent}
            // biome-ignore lint/a11y/noAutofocus: the card just asked for this answer
            autoFocus
            onChange={(event) => flow.setText(event.target.value)}
          />
        )}
        <div className="ask-card__actions">
          {flow.flow.step > 0 && (
            <button type="button" className="ask-card__ghost" onClick={flow.back}>
              {t("ask-prev")}
            </button>
          )}
          {(!many || typing || question.multiple) && (
            <button
              type="button"
              className="ask-card__submit"
              disabled={!flow.canSubmit || flow.flow.sent}
              onClick={flow.submit}
            >
              {submitLabel}
            </button>
          )}
          {question.multiple && !typing && (
            <button
              type="button"
              className="ask-card__ghost"
              disabled={flow.flow.sent}
              onClick={flow.none}
            >
              {t("ask-none")}
            </button>
          )}
          <button
            type="button"
            className="ask-card__ghost"
            disabled={flow.flow.sent}
            onClick={flow.skip}
          >
            {many ? t("ask-skip-step") : t("ask-skip")}
          </button>
          {!many && question.options.length > 0 && !question.multiple && (
            <span className="ask-card__keys">{t("ask-keys")}</span>
          )}
        </div>
      </div>
    </section>
  );
}

function answerText(answer: AskAnswer | undefined, none: string, skipped: string): string {
  if (!answer) return skipped;
  const text = summarizeAnswer(answer);
  if (text === null) return skipped;
  return text === "" ? none : text;
}

export function AnsweredAsk({ ask, answers }: { ask: AskRequest; answers: AskAnswer[] }) {
  const { t } = useI18n();
  return (
    <>
      {ask.questions.map((question, index) => {
        const answer = answers[index];
        const skipped = !answer || answer.kind === "skipped";
        return (
          <div key={question.text} className="ask-answered" data-skipped={skipped || undefined}>
            <svg className="ask-answered__mark" aria-hidden="true" viewBox="0 0 24 24">
              <path d={skipped ? "M5 12h14" : "M5 12l5 5 9-10"} />
            </svg>
            <span className="ask-answered__question">{question.text}</span>
            <b>{answerText(answer, t("ask-answered-none"), t("ask-answered-skipped"))}</b>
          </div>
        );
      })}
    </>
  );
}
