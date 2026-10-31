import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

const SHORT_MS = 3_000;
const WITH_ACTION_MS = 6_000;

export interface ToastSpec {
  text: string;
  action?: { label: string; run: () => void };
  ms?: number;
}

export function useToast(): { toast: ReactNode; show: (spec: ToastSpec) => void } {
  const [current, setCurrent] = useState<(ToastSpec & { id: number }) | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const seq = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const show = useCallback((spec: ToastSpec) => {
    window.clearTimeout(timer.current);
    seq.current += 1;
    setCurrent({ ...spec, id: seq.current });
    timer.current = window.setTimeout(
      () => setCurrent(null),
      spec.ms ?? (spec.action ? WITH_ACTION_MS : SHORT_MS),
    );
  }, []);

  const toast = current ? (
    <div key={current.id} className="toast" role="status">
      {current.text}
      {current.action && (
        <button
          type="button"
          className="toast__action"
          onClick={() => {
            current.action?.run();
            setCurrent(null);
          }}
        >
          {current.action.label}
        </button>
      )}
    </div>
  ) : null;

  return { toast, show };
}
