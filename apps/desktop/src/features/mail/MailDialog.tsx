import {
  MAIL_CATEGORIES,
  MAIL_CATEGORY_KEYS,
  MAIL_FAILURE_KEYS,
  MAIL_PROVIDERS,
  type MailProviderInfo,
  mailProvider,
} from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { MailCategory, MailItem, MailStatus } from "@xiaoban/protocol";
import { useEffect, useRef, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { dismiss, dismissOnCancel } from "../../lib/dialog.ts";
import { openExternal } from "../../lib/external.ts";
import { recency } from "../chat/time.ts";
import { ConfirmDialog } from "../dialog/ConfirmDialog.tsx";
import { MailMark } from "./MailMark.tsx";
import { MailOriginalDialog } from "./MailOriginalDialog.tsx";
import { MailRow } from "./MailToday.tsx";
import { useMailAct } from "./useMailAct.ts";

function useWhen() {
  const { t, locale } = useI18n();
  return (time: number) => {
    const value = recency(time, Date.now(), locale);
    if (value.kind === "now") return t("time-just-now");
    if (value.kind === "yesterday") return t("time-yesterday");
    return value.text;
  };
}

function Providers({ onPick }: { onPick: (provider: MailProviderInfo) => void }) {
  const { t } = useI18n();
  return (
    <>
      <div className="mail-intro">
        <b>{t("mail-intro-title")}</b>
        <p>{t("mail-intro-body-computer")}</p>
      </div>
      <div className="mail-providers">
        {MAIL_PROVIDERS.map((provider) => (
          <button
            key={provider.id}
            type="button"
            className="mail-provider"
            onClick={() => onPick(provider)}
          >
            <MailMark provider={provider.id} />
            <span className="mail-provider__text">
              <b>{t(provider.name)}</b>
              <small>{t(provider.sub)}</small>
            </span>
            <svg className="mail-provider__go" aria-hidden="true" viewBox="0 0 24 24">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        ))}
      </div>
    </>
  );
}

function ConnectForm({
  provider,
  onCancel,
  onDone,
}: {
  provider: MailProviderInfo;
  onCancel: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const [address, setAddress] = useState("");
  const [password, setPassword] = useState("");
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MailStatus | null>(null);
  const other = provider.id === "other";
  const ready =
    address.includes("@") && password.trim().length > 0 && (!other || host.trim().length > 0);
  const done = result?.connected === true;

  const connect = async () => {
    if (busy || !ready) return;
    setBusy(true);
    try {
      setResult(
        await store.connectMail(provider.id, address.trim(), password, other ? host.trim() : null),
      );
    } catch {
      setResult({
        connected: false,
        provider: null,
        address: null,
        total: 0,
        checkedAt: null,
        syncing: false,
        failure: "unreachable",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mail-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (done) onDone();
        else void connect();
      }}
    >
      <b className="mail-form__title">{t(provider.name)}</b>
      <label className="mail-form__field">
        <span>{t("mail-address")}</span>
        <input
          className="ws-settings__input"
          type="email"
          value={address}
          placeholder={t("mail-address-placeholder")}
          autoComplete="email"
          disabled={done}
          onChange={(event) => setAddress(event.target.value)}
        />
      </label>
      {other && (
        <label className="mail-form__field">
          <span>{t("mail-host")}</span>
          <input
            className="ws-settings__input"
            value={host}
            placeholder={t("mail-host-placeholder")}
            disabled={done}
            onChange={(event) => setHost(event.target.value)}
          />
        </label>
      )}
      <label className="mail-form__field">
        <span>{t(provider.password)}</span>
        <input
          className="ws-settings__input mail-form__secret"
          type="password"
          value={password}
          autoComplete="off"
          disabled={done}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {provider.url ? (
        <button
          type="button"
          className="mail-form__help"
          onClick={() => void openExternal(provider.url ?? "").catch(() => undefined)}
        >
          {t(provider.help)}
        </button>
      ) : (
        <p className="mail-form__note">{t(provider.help)}</p>
      )}
      <p className="mail-form__note">{t("mail-keychain-computer")}</p>
      <div className="mail-form__buttons">
        <button type="button" className="button--line" onClick={onCancel}>
          {t("mail-cancel")}
        </button>
        <button type="submit" className="button--dark" disabled={!done && (!ready || busy)}>
          {t(done ? "mail-done" : busy ? "mail-connecting" : "mail-connect")}
        </button>
      </div>
      {done && (
        <div className="mail-result" data-ok>
          <b>
            <svg className="mail-result__check" aria-hidden="true" viewBox="0 0 24 24">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
            {t("mail-connected-title")}
          </b>
          <p>{t("mail-connected-body", { count: result.total })}</p>
        </div>
      )}
      {result && !result.connected && (
        <div className="mail-result" role="alert">
          <b>{t("mail-failed-title")}</b>
          <p>{t(MAIL_FAILURE_KEYS[result.failure ?? "unreachable"])}</p>
        </div>
      )}
    </form>
  );
}

function Connected({
  status,
  onOpenThread,
}: {
  status: MailStatus;
  onOpenThread: (threadId: string) => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const when = useWhen();
  const { act, notice } = useMailAct(onOpenThread);
  const [category, setCategory] = useState<MailCategory | null>(null);
  const [items, setItems] = useState<MailItem[] | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const checkedAt = status.checkedAt;

  useEffect(() => {
    let live = true;
    void store
      .mailList(category)
      .then((list) => {
        if (live) setItems(list);
      })
      .catch(() => {
        if (live) setItems([]);
      });
    return () => {
      live = false;
    };
  }, [store, category, checkedAt]);

  const line = status.syncing
    ? t("mail-status-syncing")
    : status.failure
      ? t("mail-status-failed")
      : checkedAt
        ? t("mail-status-synced", { count: status.total, when: when(checkedAt) })
        : t("mail-status-never");

  return (
    <>
      <div className="mail-account">
        <MailMark provider={status.provider} />
        <span className="mail-provider__text">
          <b>{`${t(mailProvider(status.provider).name)} · ${status.address ?? ""}`}</b>
          <small data-warn={status.failure ? true : undefined}>{line}</small>
        </span>
        <button type="button" className="mail-account__leave" onClick={() => setLeaving(true)}>
          {t("mail-disconnect")}
        </button>
      </div>
      <div className="mail-filter" role="tablist">
        {[null, ...MAIL_CATEGORIES].map((chip) => (
          <button
            key={chip ?? "all"}
            type="button"
            role="tab"
            aria-selected={chip === category}
            className="mail-filter__chip"
            onClick={() => setCategory(chip)}
          >
            {t(chip ? MAIL_CATEGORY_KEYS[chip] : "mail-category-all")}
          </button>
        ))}
      </div>
      <div className="mail-list">
        {items !== null && items.length === 0 ? (
          <p className="life-card__hint">{t("mail-list-empty")}</p>
        ) : (
          (items ?? []).map((item) => (
            <MailRow key={item.id} item={item} onAct={act} onOpen={setReading} />
          ))
        )}
      </div>
      {notice && <p className="life-card__hint">{notice}</p>}
      {reading && <MailOriginalDialog id={reading} onClose={() => setReading(null)} />}
      {leaving && (
        <ConfirmDialog
          title={t("mail-disconnect-title")}
          body={t("mail-disconnect-body")}
          confirm={t("mail-disconnect-ok")}
          onConfirm={() => void store.disconnectMail().catch(() => undefined)}
          onClose={() => setLeaving(false)}
        />
      )}
    </>
  );
}

export function MailDialog({
  onClose,
  onOpenThread,
}: {
  onClose: () => void;
  onOpenThread: (threadId: string) => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const { mailStatus } = useHubState(store);
  const dialog = useRef<HTMLDialogElement>(null);
  const [picked, setPicked] = useState<MailProviderInfo | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
    void store.loadMailStatus().catch(() => undefined);
  }, [store]);

  const connected = mailStatus?.connected === true && !adding;
  const title = connected
    ? t("services-title")
    : picked
      ? t("mail-connect-title")
      : t("mail-add-title");

  return (
    <dialog
      ref={dialog}
      onCancel={dismissOnCancel}
      onClose={onClose}
      className="dialog ws-settings mail-dialog"
      aria-labelledby="mail-dialog-title"
    >
      <div className="ws-settings__head">
        {picked && !connected ? (
          <button
            type="button"
            className="dialog__close"
            aria-label={t("onboarding-back")}
            onClick={() => setPicked(null)}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
        ) : null}
        <h2 id="mail-dialog-title" className="dialog__title">
          {title}
        </h2>
        <button
          type="button"
          className="dialog__close"
          aria-label={t("dialog-close")}
          onClick={() => dismiss(dialog.current)}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M7 7l10 10M17 7L7 17" />
          </svg>
        </button>
      </div>
      <section className="ws-settings__section mail-dialog__body">
        {connected && mailStatus ? (
          <Connected status={mailStatus} onOpenThread={onOpenThread} />
        ) : picked ? (
          <ConnectForm
            provider={picked}
            onCancel={() => setPicked(null)}
            onDone={() => {
              setPicked(null);
              setAdding(false);
            }}
          />
        ) : (
          <Providers
            onPick={(provider) => {
              setAdding(true);
              setPicked(provider);
            }}
          />
        )}
      </section>
    </dialog>
  );
}
