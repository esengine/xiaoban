import Svg, { Circle, Path, Rect } from "react-native-svg";

export type IconName =
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
  | "check";

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
      {name === "chevronDown" && <Path {...common} d="M6 9l6 6 6-6" />}
      {name === "chevronRight" && <Path {...common} d="M9 5l7 7-7 7" />}
      {name === "close" && <Path {...common} d="M6 6l12 12M18 6L6 18" />}
      {name === "check" && <Path {...common} d="M5 12.5l4.5 4.5L19 7.5" />}
    </Svg>
  );
}
