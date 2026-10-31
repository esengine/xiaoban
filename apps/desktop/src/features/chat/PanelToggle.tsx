import { useI18n } from "@xiaoban/i18n/react";

export function PanelToggle({
  side,
  open,
  onToggle,
}: {
  side: "list" | "workspace";
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const shortcut = t(side === "list" ? "panel-list-shortcut" : "panel-workspace-shortcut");
  const label =
    side === "list"
      ? t(open ? "panel-list-hide" : "panel-list-show", { shortcut })
      : t(open ? "panel-workspace-hide" : "panel-workspace-show", { shortcut });
  return (
    <button
      type="button"
      className="panel-toggle"
      aria-pressed={open}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24">
        <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
        <path d={side === "list" ? "M9.5 4.5v15" : "M14.5 4.5v15"} />
      </svg>
    </button>
  );
}
