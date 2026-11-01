import type { Slide } from "@xiaoban/protocol";
import { type SlideThemeName, slideThemes } from "@xiaoban/tokens";
import {
  Award,
  BookOpen,
  Briefcase,
  Building,
  Calendar,
  Car,
  ChartBar,
  ChartLine,
  CircleCheck,
  Clock,
  Cloud,
  Coffee,
  Cpu,
  Database,
  DollarSign,
  Flag,
  Gift,
  Globe,
  GraduationCap,
  Heart,
  House,
  Layers,
  Leaf,
  Lightbulb,
  Lock,
  type LucideIcon,
  Mail,
  MapPin,
  MessageCircle,
  Monitor,
  Phone,
  Plane,
  Puzzle,
  RefreshCw,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Smile,
  Sparkles,
  Star,
  Sun,
  Target,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Truck,
  User,
  Users,
  Utensils,
  Wifi,
  Zap,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

export const BASE_W = 960;
export const BASE_H = 540;

export const ICONS: Record<string, LucideIcon> = {
  rocket: Rocket,
  "chart-line": ChartLine,
  "chart-bar": ChartBar,
  users: Users,
  user: User,
  "shield-check": ShieldCheck,
  clock: Clock,
  sparkles: Sparkles,
  target: Target,
  lightbulb: Lightbulb,
  "circle-check": CircleCheck,
  "triangle-alert": TriangleAlert,
  "trending-up": TrendingUp,
  "trending-down": TrendingDown,
  "dollar-sign": DollarSign,
  calendar: Calendar,
  "map-pin": MapPin,
  house: House,
  heart: Heart,
  star: Star,
  zap: Zap,
  settings: Settings,
  search: Search,
  mail: Mail,
  phone: Phone,
  "message-circle": MessageCircle,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  briefcase: Briefcase,
  building: Building,
  globe: Globe,
  lock: Lock,
  cloud: Cloud,
  database: Database,
  cpu: Cpu,
  smartphone: Smartphone,
  monitor: Monitor,
  wifi: Wifi,
  truck: Truck,
  "shopping-cart": ShoppingCart,
  gift: Gift,
  coffee: Coffee,
  utensils: Utensils,
  plane: Plane,
  car: Car,
  leaf: Leaf,
  sun: Sun,
  flag: Flag,
  award: Award,
  puzzle: Puzzle,
  layers: Layers,
  "refresh-cw": RefreshCw,
  "thumbs-up": ThumbsUp,
  smile: Smile,
};

export type SlideTheme = (typeof slideThemes)[SlideThemeName];

export function themeOf(name: string): SlideTheme {
  return slideThemes[(name in slideThemes ? name : "blue") as SlideThemeName];
}

export type Part = "title" | "subtitle" | "body" | "chart" | "image";

function num(text: string) {
  const value = Number(text.replace(/[,¥$%\s]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function Deco({ theme, strong }: { theme: SlideTheme; strong: boolean }) {
  if (theme.deco === "circles")
    return (
      <>
        <span
          className="slide__deco"
          style={{
            right: -90,
            top: -90,
            width: strong ? 380 : 220,
            height: strong ? 380 : 220,
            borderRadius: "50%",
            background: theme.soft,
          }}
        />
        {strong && (
          <span
            className="slide__deco"
            style={{
              right: 170,
              bottom: -80,
              width: 180,
              height: 180,
              borderRadius: "50%",
              border: `14px solid ${theme.soft}`,
            }}
          />
        )}
      </>
    );
  if (theme.deco === "band")
    return strong ? (
      <>
        <span
          className="slide__deco"
          style={{ left: 0, top: 0, bottom: 0, width: 300, background: theme.accent }}
        />
        <span
          className="slide__deco"
          style={{ left: 300, top: 0, bottom: 0, width: 16, background: theme.soft }}
        />
      </>
    ) : (
      <span
        className="slide__deco"
        style={{ left: 0, top: 0, bottom: 0, width: 14, background: theme.accent }}
      />
    );
  if (theme.deco === "glow")
    return (
      <span
        className="slide__deco"
        style={{
          inset: 0,
          background: `radial-gradient(circle at 85% 18%, ${theme.soft}, transparent ${strong ? 60 : 40}%)`,
        }}
      />
    );
  return (
    <>
      {Array.from({ length: 16 }, (_, index) => (
        <span
          key={index}
          className="slide__deco"
          style={{ left: 60 + index * 60, top: 0, bottom: 0, width: 1, background: theme.soft }}
        />
      ))}
    </>
  );
}

function ChartBody({
  slide,
  theme,
  animate,
}: {
  slide: Slide;
  theme: SlideTheme;
  animate: boolean;
}) {
  const chart = slide.chart;
  if (!chart || chart.values.length === 0) return null;
  const values = chart.values.map(num);
  const max = Math.max(1, ...values.map(Math.abs));
  const [x0, y0, w, h] = [90, 200, 780, 250];
  const low = Math.min(...values);
  const floor = chart.kind === "line" && low > 0 ? Math.max(0, low - (max - low) * 0.6) : 0;
  const step = w / values.length;
  if (chart.kind === "pie") {
    const total = values.reduce((sum, value) => sum + Math.max(0, value), 0) || 1;
    let angle = -Math.PI / 2;
    const shades = [theme.accent, theme.muted, theme.soft, theme.ink];
    return (
      <svg
        className="slide__svg"
        width={BASE_W}
        height={BASE_H}
        role="img"
        aria-label={slide.title}
      >
        {values.map((value, index) => {
          const share = Math.max(0, value) / total;
          const start = angle;
          angle += share * Math.PI * 2;
          const [cx, cy, r] = [300, 310, 150];
          const large = share > 0.5 ? 1 : 0;
          const label = chart.labels[index] ?? "";
          return (
            <g
              key={`${label}-${index}`}
              className={animate ? "slide__grow" : undefined}
              style={{ animationDelay: `${index * 120}ms` }}
            >
              <path
                d={`M${cx},${cy} L${cx + r * Math.cos(start)},${cy + r * Math.sin(start)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)} Z`}
                fill={shades[index % shades.length]}
                stroke={theme.bg}
                strokeWidth={3}
              />
              <rect
                x={540}
                y={200 + index * 40}
                width={18}
                height={18}
                rx={4}
                fill={shades[index % shades.length]}
              />
              <text
                x={570}
                y={215 + index * 40}
                fontSize={20}
                fill={theme.ink}
              >{`${label}  ${Math.round(share * 100)}%`}</text>
            </g>
          );
        })}
      </svg>
    );
  }
  const yOf = (value: number) =>
    y0 + h - (Math.max(0, value - floor) / Math.max(1, max - floor)) * h;
  return (
    <svg className="slide__svg" width={BASE_W} height={BASE_H} role="img" aria-label={slide.title}>
      <line x1={x0} x2={x0 + w} y1={y0 + h} y2={y0 + h} stroke={theme.soft} strokeWidth={2} />
      {chart.kind === "line" && (
        <polyline
          className={animate ? "slide__draw" : undefined}
          points={values
            .map((value, index) => `${x0 + index * step + step / 2},${yOf(value)}`)
            .join(" ")}
          fill="none"
          stroke={theme.accent}
          strokeWidth={4}
          pathLength={1}
        />
      )}
      {values.map((value, index) => {
        const x = x0 + index * step + step / 2;
        const on = chart.highlight === index;
        const label = chart.labels[index] ?? "";
        return (
          <g
            key={`${label}-${index}`}
            className={animate && chart.kind === "bar" ? "slide__grow" : undefined}
            style={{ animationDelay: `${index * 80}ms` }}
          >
            {chart.kind === "bar" ? (
              <rect
                x={x - Math.min(36, step / 3)}
                y={yOf(value)}
                width={Math.min(72, (step * 2) / 3)}
                height={y0 + h - yOf(value)}
                rx={6}
                fill={theme.accent}
                opacity={chart.highlight === null || chart.highlight === undefined || on ? 1 : 0.45}
              />
            ) : (
              <circle cx={x} cy={yOf(value)} r={on ? 9 : 6} fill={theme.accent} />
            )}
            <text
              x={x}
              y={yOf(value) - 14}
              textAnchor="middle"
              fontSize={on ? 22 : 17}
              fontWeight={on ? 700 : 400}
              fill={theme.ink}
            >
              {chart.values[index]}
            </text>
            <text x={x} y={y0 + h + 30} textAnchor="middle" fontSize={17} fill={theme.muted}>
              {label.slice(0, 10)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function SlideView({
  slide,
  theme: themeName,
  width,
  animate = false,
  step = Number.POSITIVE_INFINITY,
  selected = null,
  onPick,
}: {
  slide: Slide;
  theme: string;
  width: number;
  animate?: boolean;
  step?: number;
  selected?: Part | null;
  onPick?: (part: Part, event: React.MouseEvent) => void;
}) {
  const theme = themeOf(themeName);
  const scale = width / BASE_W;
  const anim = animate && !slide.still;
  const pick = (part: Part) =>
    onPick
      ? {
          "data-part": part,
          "data-selected": selected === part || undefined,
          onMouseDown: (event: React.MouseEvent) => {
            event.stopPropagation();
            onPick(part, event);
          },
        }
      : {};
  const shown = (index: number) => !anim || index < step;
  const enter = (index: number): CSSProperties | undefined =>
    anim ? { animationDelay: `${index * 90}ms` } : undefined;
  const items = slide.items;
  let body: ReactNode = null;

  const title = (top = 52, left = 64, size = 38) => (
    <div
      className="slide__part slide__title"
      style={{ left, top, fontSize: size, color: theme.ink, right: 64 }}
      {...pick("title")}
    >
      {slide.title}
      <span className="slide__bar" style={{ background: theme.accent }} />
    </div>
  );

  switch (slide.layout) {
    case "title":
    case "section": {
      const band = theme.deco === "band";
      const onBand = slide.layout === "section" && !band;
      return (
        <div className="slide" style={{ width, height: (width * 9) / 16 }}>
          <div
            className="slide__canvas"
            style={{ transform: `scale(${scale})`, background: onBand ? theme.accent : theme.bg }}
          >
            {!onBand && <Deco theme={theme} strong />}
            <div
              className={`slide__part slide__hero ${anim ? "slide__in" : ""}`}
              style={{
                left: band ? 380 : 84,
                top: slide.layout === "title" ? 200 : 230,
                right: 84,
                color: onBand ? theme.onAccent : theme.ink,
              }}
              {...pick("title")}
            >
              {!onBand && <span className="slide__hero-bar" style={{ background: theme.accent }} />}
              {slide.title}
            </div>
            {slide.subtitle && (
              <div
                className={`slide__part slide__sub ${anim ? "slide__in" : ""}`}
                style={{
                  left: band ? 384 : 88,
                  top: 320,
                  color: onBand ? theme.onAccent : theme.muted,
                  animationDelay: "150ms",
                }}
                {...pick("subtitle")}
              >
                {slide.subtitle}
              </div>
            )}
          </div>
        </div>
      );
    }
    case "quote":
      return (
        <div className="slide" style={{ width, height: (width * 9) / 16 }}>
          <div
            className="slide__canvas"
            style={{
              transform: `scale(${scale})`,
              background: `linear-gradient(135deg, ${theme.accent}, ${theme.dark})`,
            }}
          >
            <span className="slide__quote-mark" style={{ color: theme.onAccent }}>
              {"“"}
            </span>
            <div
              className={`slide__part slide__quote ${anim ? "slide__in" : ""}`}
              style={{ color: theme.onDark }}
              {...pick("title")}
            >
              {slide.title}
            </div>
            {slide.subtitle && (
              <div
                className={`slide__part slide__quote-from ${anim ? "slide__in" : ""}`}
                style={{ animationDelay: "250ms", color: theme.onDark }}
                {...pick("subtitle")}
              >
                {`—— ${slide.subtitle}`}
              </div>
            )}
          </div>
        </div>
      );
    case "number":
      body = (
        <div className="slide__part slide__number" {...pick("body")}>
          <span className={anim ? "slide__in" : undefined} style={{ color: theme.accent }}>
            {items[0]?.value || items[0]?.text || slide.subtitle}
          </span>
          <span
            className={anim ? "slide__in" : undefined}
            style={{ color: theme.muted, animationDelay: "200ms" }}
          >
            {items[0]?.value ? items[0]?.text : slide.subtitle}
          </span>
        </div>
      );
      break;
    case "chart":
      body = (
        <div className="slide__part slide__chart" {...pick("chart")}>
          <ChartBody slide={slide} theme={theme} animate={anim} />
        </div>
      );
      break;
    case "two":
    case "compare":
      body = (
        <div className="slide__part slide__two" {...pick("body")}>
          {slide.columns.slice(0, 2).map((column, index) => {
            const filled = slide.layout === "compare" && index === 1;
            return (
              <div
                key={`${column.title}-${index}`}
                className={`slide__column ${anim ? "slide__in" : ""}`}
                data-card={slide.layout === "compare" || undefined}
                style={{
                  background:
                    slide.layout === "compare" ? (filled ? theme.accent : theme.soft) : undefined,
                  color: filled ? theme.onAccent : theme.ink,
                  animationDelay: `${index * 150}ms`,
                }}
              >
                <b style={{ color: filled ? theme.onAccent : theme.accent }}>{column.title}</b>
                {column.items.map((line, row) => (
                  <span key={`${line}-${row}`}>
                    {slide.layout === "compare" ? `✓ ${line}` : line}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      );
      break;
    case "flow":
      body = (
        <div className="slide__part slide__flow" {...pick("body")}>
          {items.slice(0, 5).map((item, index) => {
            const last = index === Math.min(items.length, 5) - 1;
            return shown(index) ? (
              <div
                key={`${item.text}-${index}`}
                className={`slide__step ${anim ? "slide__in" : ""}`}
                style={enter(index)}
              >
                <div
                  className="slide__step-box"
                  style={{
                    background: last ? theme.accent : theme.soft,
                    color: last ? theme.onAccent : theme.ink,
                  }}
                >
                  <span className="slide__step-no">{String(index + 1).padStart(2, "0")}</span>
                  <b>{item.text}</b>
                  {item.note && <span className="slide__step-note">{item.note}</span>}
                </div>
                {!last && (
                  <span className="slide__arrow" style={{ color: theme.accent }}>
                    {"→"}
                  </span>
                )}
              </div>
            ) : null;
          })}
        </div>
      );
      break;
    case "timeline": {
      const count = Math.min(items.length, 6);
      const gap = count > 1 ? 760 / (count - 1) : 0;
      body = (
        <div className="slide__part slide__timeline" {...pick("body")}>
          <span className="slide__line" style={{ background: theme.soft }} />
          {items.slice(0, 6).map((item, index) =>
            shown(index) ? (
              <div
                key={`${item.text}-${index}`}
                className={`slide__node ${anim ? "slide__in" : ""}`}
                style={{ left: 40 + index * gap, ...enter(index) }}
              >
                <b style={{ color: theme.accent }}>{item.note}</b>
                <span
                  className="slide__dot"
                  style={{
                    borderColor: theme.accent,
                    background: index < count - 1 ? theme.accent : theme.bg,
                  }}
                />
                <span style={{ color: theme.ink }}>{item.text}</span>
              </div>
            ) : null,
          )}
        </div>
      );
      break;
    }
    case "funnel":
      body = (
        <div className="slide__part slide__funnel" {...pick("body")}>
          {items.slice(0, 5).map((item, index) =>
            shown(index) ? (
              <div
                key={`${item.text}-${index}`}
                className={`slide__layer ${anim ? "slide__in" : ""}`}
                style={{
                  width: 720 - index * 130,
                  background: theme.accent,
                  opacity: 1 - index * 0.16,
                  color: theme.onAccent,
                  ...enter(index),
                }}
              >
                <b>{item.text}</b>
                <span>{item.note || item.value}</span>
              </div>
            ) : null,
          )}
        </div>
      );
      break;
    case "icons":
      body = (
        <div className="slide__part slide__icons" {...pick("body")}>
          {items.slice(0, 6).map((item, index) => {
            const Icon = ICONS[item.icon] ?? Sparkles;
            return shown(index) ? (
              <div
                key={`${item.text}-${index}`}
                className={`slide__icon-cell ${anim ? "slide__in" : ""}`}
                style={enter(index)}
              >
                <span
                  className="slide__icon"
                  style={{ background: theme.soft, color: theme.accent }}
                >
                  <Icon size={38} strokeWidth={1.8} />
                </span>
                <span>
                  <b style={{ color: theme.ink }}>{item.text}</b>
                  {item.note && <span style={{ color: theme.muted }}>{item.note}</span>}
                </span>
              </div>
            ) : null;
          })}
        </div>
      );
      break;
    default:
      body = (
        <div
          className="slide__part slide__bullets"
          style={{ right: slide.image ? 420 : 64 }}
          {...pick("body")}
        >
          {items.slice(0, 6).map((item, index) => {
            const Icon = item.icon ? ICONS[item.icon] : null;
            return shown(index) ? (
              <div
                key={`${item.text}-${index}`}
                className={`slide__bullet ${anim ? "slide__in" : ""}`}
                style={{ color: theme.ink, ...enter(index) }}
              >
                {Icon ? (
                  <Icon size={26} color={theme.accent} strokeWidth={2} />
                ) : (
                  <span className="slide__dotmark" style={{ background: theme.accent }} />
                )}
                <span>
                  {item.text}
                  {item.note && (
                    <span className="slide__bullet-note" style={{ color: theme.muted }}>
                      {item.note}
                    </span>
                  )}
                </span>
              </div>
            ) : null;
          })}
        </div>
      );
  }

  return (
    <div className="slide" style={{ width, height: (width * 9) / 16 }}>
      <div className="slide__canvas" style={{ transform: `scale(${scale})`, background: theme.bg }}>
        <Deco theme={theme} strong={false} />
        {title()}
        {slide.subtitle && slide.layout !== "number" && (
          <div
            className="slide__part slide__subline"
            style={{ color: theme.muted }}
            {...pick("subtitle")}
          >
            {slide.subtitle}
          </div>
        )}
        {body}
        {slide.image && slide.layout === "bullets" && (
          <div className="slide__part slide__image" {...pick("image")}>
            <img
              src={slide.image.url}
              alt=""
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
            />
            <span className="slide__credit">{slide.image.credit}</span>
          </div>
        )}
      </div>
    </div>
  );
}
