import Svg, { Circle, Path, Rect } from "react-native-svg";

export type IconName =
  | "copy"
  | "plus"
  | "chat"
  | "sun"
  | "grid"
  | "person"
  | "search"
  | "plusCircle"
  | "back"
  | "more"
  | "send"
  | "face"
  | "chevronDown"
  | "chevronRight"
  | "close"
  | "check"
  | "mic"
  | "keyboard"
  | "folder";

export function Icon({
  name,
  size = 22,
  color,
  width = 1.8,
}: {
  name: IconName;
  size?: number;
  color: string;
  width?: number;
}) {
  const common = {
    fill: "none",
    stroke: color,
    strokeWidth: width,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "chat" && <Path {...common} d="M4 5h16v11H9l-5 4z" />}
      {name === "sun" && (
        <>
          <Circle {...common} cx={12} cy={12} r={4} />
          <Path
            {...common}
            d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"
          />
        </>
      )}
      {name === "grid" && (
        <>
          <Rect {...common} x={4} y={4} width={7} height={7} rx={2} />
          <Rect {...common} x={13} y={4} width={7} height={7} rx={2} />
          <Rect {...common} x={4} y={13} width={7} height={7} rx={2} />
          <Rect {...common} x={13} y={13} width={7} height={7} rx={2} />
        </>
      )}
      {name === "person" && (
        <>
          <Circle {...common} cx={12} cy={8} r={4} />
          <Path {...common} d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </>
      )}
      {name === "search" && (
        <>
          <Circle {...common} cx={11} cy={11} r={7} />
          <Path {...common} d="M20 20l-3.5-3.5" />
        </>
      )}
      {name === "plus" && <Path {...common} d="M12 5v14M5 12h14" />}
      {name === "copy" && (
        <>
          <Path {...common} d="M9 9h10v10H9z" />
          <Path {...common} d="M5 15V5h10" />
        </>
      )}
      {name === "plusCircle" && (
        <>
          <Circle {...common} cx={12} cy={12} r={9} />
          <Path {...common} d="M12 8v8M8 12h8" />
        </>
      )}
      {name === "back" && <Path {...common} strokeWidth={2} d="M15 5l-7 7 7 7" />}
      {name === "more" && (
        <>
          <Circle cx={5} cy={12} r={1.6} fill={color} />
          <Circle cx={12} cy={12} r={1.6} fill={color} />
          <Circle cx={19} cy={12} r={1.6} fill={color} />
        </>
      )}
      {name === "send" && <Path {...common} strokeWidth={2.2} d="M12 19V5M6 11l6-6 6 6" />}
      {name === "face" && (
        <>
          <Circle {...common} cx={12} cy={12} r={8} />
          <Circle cx={9} cy={11} r={0.9} fill={color} />
          <Circle cx={15} cy={11} r={0.9} fill={color} />
          <Path {...common} d="M9 15c1.6 1.2 4.4 1.2 6 0" />
        </>
      )}
      {name === "folder" && (
        <Path {...common} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      )}
      {name === "chevronDown" && <Path {...common} d="M6 9l6 6 6-6" />}
      {name === "chevronRight" && <Path {...common} d="M9 5l7 7-7 7" />}
      {name === "close" && <Path {...common} d="M6 6l12 12M18 6L6 18" />}
      {name === "check" && <Path {...common} d="M5 12.5l4.5 4.5L19 7.5" />}
      {name === "mic" && (
        <>
          <Rect {...common} x={9} y={3} width={6} height={11} rx={3} />
          <Path {...common} d="M5 11a7 7 0 0014 0M12 18v3" />
        </>
      )}
      {name === "keyboard" && (
        <>
          <Rect {...common} x={3} y={6} width={18} height={12} rx={2} />
          <Path {...common} d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
        </>
      )}
    </Svg>
  );
}
