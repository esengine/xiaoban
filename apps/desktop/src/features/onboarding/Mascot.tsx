export function Mascot() {
  return (
    <div className="mascot">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <g className="mascot__eyes">
          <circle cx="9" cy="11" r="0.8" />
          <circle cx="15" cy="11" r="0.8" />
        </g>
        <path d="M9 15c1.6 1.2 4.4 1.2 6 0" />
      </svg>
    </div>
  );
}
