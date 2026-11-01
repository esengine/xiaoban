import type { CSSProperties } from "react";

export function Segmented<T extends string | number | null>({
  options,
  value,
  onChange,
  disabled = false,
  className = "",
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  return (
    <div
      className={`segmented ${className}`}
      data-disabled={disabled || undefined}
      style={{ "--count": options.length, "--index": index } as CSSProperties}
    >
      <span className="segmented__thumb" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          aria-pressed={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
