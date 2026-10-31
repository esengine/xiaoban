import { type FormEvent, useState } from "react";

interface Props {
  busy: boolean;
  onSend: (text: string) => Promise<unknown>;
  onStop: () => Promise<unknown>;
}

export function Composer({ busy, onSend, onStop }: Props) {
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
        <span className="visually-hidden">对小伴说</span>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="说点什么"
          autoComplete="off"
        />
      </label>
      {busy ? (
        <button type="button" className="button button--stop" onClick={() => void onStop()}>
          停
        </button>
      ) : (
        <button type="submit" className="button button--primary" disabled={!text.trim()}>
          发送
        </button>
      )}
    </form>
  );
}
