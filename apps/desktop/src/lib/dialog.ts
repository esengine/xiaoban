const CLOSE_MS = 120;

export function dismiss(dialog: HTMLDialogElement | null | undefined) {
  if (!dialog?.open || dialog.dataset.closing) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    dialog.close();
    return;
  }
  dialog.dataset.closing = "true";
  window.setTimeout(() => {
    delete dialog.dataset.closing;
    dialog.close();
  }, CLOSE_MS);
}

export function dismissOnCancel(event: {
  preventDefault: () => void;
  currentTarget: HTMLDialogElement;
}) {
  event.preventDefault();
  dismiss(event.currentTarget);
}
