import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { dismiss, dismissOnCancel } from "../../lib/dialog.ts";
import { openExternal } from "../../lib/external.ts";
import { CheckIcon, GlobeIcon, OutIcon } from "./icons.tsx";

const PLATFORM = "https://platform.deepseek.com/api_keys";

type Phase = "idle" | "verifying" | "invalid" | "offline" | "connected" | "skipped";

export function SearchCard({
  threadId,
  answered,
  onDone,
  onSkip,
}: {
  threadId: string;
  answered: boolean;
  onDone?: () => void;
  onSkip?: () => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const { services } = useHubState(store);
  const connected = services.some((status) => status.service === "web_search" && status.connected);
  const [phase, setPhase] = useState<Phase>(
    connected ? "connected" : answered ? "skipped" : "idle",
  );
  const [key, setKey] = useState("");

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!key.trim() || phase === "verifying") return;
    setPhase("verifying");
    try {
      const ok = await store.configureSearch(key, threadId);
      setPhase(ok ? "connected" : "invalid");
      if (ok) onDone?.();
    } catch {
      setPhase("offline");
    }
  };
  const skip = async () => {
    if (onSkip) {
      onSkip();
      return;
    }
    setPhase("skipped");
    await store.declineSearch(threadId).catch(() => undefined);
    onDone?.();
  };

  if (phase === "connected" || phase === "skipped") {
    const done = phase === "connected";
    return (
      <div className="service-card service-card--row" data-skipped={!done || undefined}>
        <span className="service-card__icon">
          <GlobeIcon />
        </span>
        <span className="service-card__body">
          {done ? (
            <>
              <b className="service-card__done">
                {t("search-card-connected")}
                <CheckIcon />
              </b>
              <span className="service-card__hint">{t("search-card-resuming")}</span>
            </>
          ) : (
            <>
              {t("search-card-skipped")}
              <span className="service-card__hint">{t("search-card-skipped-hint")}</span>
            </>
          )}
        </span>
      </div>
    );
  }

  const verifying = phase === "verifying";
  const failed = phase === "invalid" || phase === "offline";
  return (
    <form className="service-card" onSubmit={save}>
      <div className="service-card__head">
        <span className="service-card__icon">
          <GlobeIcon />
        </span>
        <span className="service-card__body">
          <b>{t("search-card-title")}</b>
          <span className="service-card__hint">{t("search-card-subtitle")}</span>
        </span>
      </div>
      <ol className="service-card__steps">
        <li>
          {t("search-card-step-1", { platform: "\u0000" })
            .split("\u0000")
            .flatMap((part, index) =>
              index === 0
                ? [part]
                : [
                    <button
                      key="platform"
                      type="button"
                      className="link-button"
                      onClick={() => void openExternal(PLATFORM)}
                    >
                      {t("search-card-platform")}
                      <OutIcon />
                    </button>,
                    part,
                  ],
            )}
        </li>
        <li>{t("search-card-step-2")}</li>
      </ol>
      <div className="service-card__entry">
        <label className="service-card__field" data-error={failed || undefined}>
          <span className="visually-hidden">{t("search-card-key")}</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            disabled={verifying}
            placeholder={t("search-card-placeholder")}
            onChange={(event) => {
              setKey(event.target.value);
              if (failed) setPhase("idle");
            }}
          />
        </label>
        <button type="submit" className="button button--dark" disabled={verifying || !key.trim()}>
          {verifying && <span className="spinner" aria-hidden="true" />}
          {t(verifying ? "search-card-verifying" : "search-card-save")}
        </button>
      </div>
      {failed && (
        <p className="service-card__error" role="alert">
          {t(phase === "invalid" ? "search-card-invalid" : "search-card-offline")}
        </p>
      )}
      <p className="service-card__foot">
        {t("search-card-keychain")}
        <button
          type="button"
          className="link-button"
          disabled={verifying}
          onClick={() => void skip()}
        >
          {t("search-card-skip")}
        </button>
      </p>
    </form>
  );
}

export function SearchDialog({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={dismissOnCancel}
      className="dialog dialog--service"
      onClose={onClose}
    >
      <SearchCard
        threadId={threadId}
        answered={false}
        onDone={() => dismiss(dialog.current)}
        onSkip={() => dismiss(dialog.current)}
      />
    </dialog>
  );
}
