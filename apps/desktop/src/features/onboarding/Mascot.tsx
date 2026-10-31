export function MascotFace({ thinking = false }: { thinking?: boolean }) {
  return (
    <svg
      className={thinking ? "mascot-face mascot-face--thinking" : "mascot-face"}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" />
      <g className="mascot-face__eyes">
        <circle cx="9" cy="11" r="0.8" />
        <circle cx="15" cy="11" r="0.8" />
      </g>
      <path d={thinking ? "M9.5 15.5h5" : "M9 15c1.6 1.2 4.4 1.2 6 0"} />
    </svg>
  );
}

export function Mascot() {
  return (
    <div className="mascot">
      <MascotFace />
    </div>
  );
}
