import { useI18n } from "@xiaoban/i18n/react";
import { type FormEvent, useState } from "react";

interface Props {
  busy: boolean;
  onSend: (text: string) => Promise<unknown>;
  onStop: () => Promise<unknown>;
}

export function Composer({ busy, onSend, onStop }: Props) {
  const { t } = useI18n();
  const [text, setText] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText("");
    await onSend(value);
  };

  return (
    <form className="composer" onSubmit={submit}>
      <label className="composer__field">
        <span className="visually-hidden">{t("composer-label")}</span>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("composer-placeholder")}
          autoComplete="off"
        />
      </label>
      {busy ? (
        <button type="button" className="button button--stop" onClick={() => void onStop()}>
          {t("composer-stop")}
        </button>
      ) : (
        <button type="submit" className="button button--primary" disabled={!text.trim()}>
          {t("composer-send")}
        </button>
      )}
    </form>
  );
}
