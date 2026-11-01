import { isTauri } from "@tauri-apps/api/core";
import { downloadDir, join } from "@tauri-apps/api/path";
import {
  activeScheme,
  areaText,
  changedRooms,
  compareTarget,
  currentLayout,
  type FloorView,
  fileName,
  floorDxf,
  latestVersion,
  pendingMeasures,
  planArea,
  preciseMeters,
  roomSize,
} from "@xiaoban/client";
import { useI18n } from "@xiaoban/i18n/react";
import type { ContextNote, FloorMeasure, FloorPlan, FloorRoom } from "@xiaoban/protocol";
import { type FormEvent, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { useToast } from "../trip/useToast.tsx";
import { FloorCanvas } from "./FloorCanvas.tsx";
import { useFloorPlan } from "./FloorCard.tsx";
import { FloorProgress } from "./FloorProgress.tsx";

type Side = "rooms" | "progress";
type Translate = ReturnType<typeof useI18n>["t"];

function roomMeta(t: Translate, room: FloorRoom): string {
  return [
    t("floorplan-area", { area: areaText(room.area) }),
    t("floorplan-size", roomSize(room)),
    room.facing ? t(`floorplan-facing-${room.facing}`) : "",
  ]
    .filter(Boolean)
    .join(t("daily-dot"));
}

function MeasureRow({ plan, measure }: { plan: FloorPlan; measure: FloorMeasure }) {
  const { t } = useI18n();
  const store = useHub();
  const [value, setValue] = useState("");
  const [bad, setBad] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const meters = Number(value.trim().replace(",", "."));
    if (!Number.isFinite(meters) || meters < 0.05 || meters > 100) {
      setBad(true);
      return;
    }
    void store
      .measureFloor(plan.id, measure.id, meters * 1000)
      .then(() => setValue(""))
      .catch(() => setBad(true));
  };
  return (
    <form className="floor-measure-row" onSubmit={submit}>
      <div className="floor-measure-row__head">
        <span className="floor-measure-row__mark">{t("floorplan-unclear-mark")}</span>
        <b>{t("floorplan-check-ask", { label: measure.label })}</b>
      </div>
      <p className="floor-measure-row__note">
        {measure.note}
        {t("floorplan-check-estimate", { meters: preciseMeters(measure.estimate) })}
      </p>
      <div className="floor-measure-row__input">
        <label className="floor-measure-row__field" data-bad={bad || undefined}>
          <input
            value={value}
            inputMode="decimal"
            placeholder={preciseMeters(measure.estimate)}
            aria-label={t("floorplan-check-ask", { label: measure.label })}
            onChange={(event) => {
              setValue(event.target.value);
              setBad(false);
            }}
          />
          <span>{t("floorplan-check-unit")}</span>
        </label>
        <button type="submit" className="button--dark" disabled={!value.trim()}>
          {t("floorplan-check-finish")}
        </button>
      </div>
      {bad && <p className="floor-measure-row__bad">{t("floorplan-check-bad")}</p>}
    </form>
  );
}

function RoomDetail({
  room,
  onAsk,
}: {
  room: FloorRoom;
  onAsk: (text: string, room: FloorRoom) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const example = room.ideas[0];
  return (
    <div className="floor-room-card">
      <div className="floor-room-card__head">
        <b>{room.name}</b>
        <span>{roomMeta(t, room)}</span>
      </div>
      <p className="floor-room-card__advice" data-empty={!room.advice || undefined}>
        {room.advice || t("floorplan-advice-empty")}
      </p>
      {room.ideas.length > 0 && (
        <div className="floor-room-card__ideas">
          {room.ideas.map((idea) => (
            <button key={idea} type="button" onClick={() => onAsk(idea, room)}>
              {idea}
            </button>
          ))}
        </div>
      )}
      <form
        className="floor-room-card__ask"
        onSubmit={(event) => {
          event.preventDefault();
          if (!text.trim()) return;
          onAsk(text.trim(), room);
          setText("");
        }}
      >
        <input
          value={text}
          placeholder={
            example
              ? t("floorplan-ask-room-example", { room: room.name, example })
              : t("floorplan-ask-room", { room: room.name })
          }
          aria-label={t("floorplan-ask-room", { room: room.name })}
          onChange={(event) => setText(event.target.value)}
        />
      </form>
    </div>
  );
}

function SchemeMenu({ plan, onClose }: { plan: FloorPlan; onClose: () => void }) {
  const { t } = useI18n();
  const store = useHub();
  const current = activeScheme(plan);
  const latest = latestVersion(current)?.number;
  return (
    <div className="floor-menu" role="menu">
      <div className="floor-menu__title">{t("floorplan-schemes-title")}</div>
      <div className="floor-menu__schemes">
        {plan.schemes.map((scheme) => (
          <button
            key={scheme.id}
            type="button"
            role="menuitemradio"
            aria-checked={scheme.id === plan.scheme}
            onClick={() => {
              void store.setFloorScheme(plan.id, scheme.id).catch(() => undefined);
              onClose();
            }}
          >
            {t("floorplan-scheme-version", {
              scheme: scheme.id,
              version: latestVersion(scheme)?.number ?? 1,
            })}
          </button>
        ))}
      </div>
      {current && (
        <>
          <div className="floor-menu__title">
            {t("floorplan-versions-title", { scheme: current.id })}
          </div>
          <ol className="floor-menu__versions">
            {[...current.versions].reverse().map((version) => (
              <li key={version.number}>
                <span className="floor-menu__version">
                  <b>{t("floorplan-version-row", { version: version.number })}</b>
                  {version.note && <span>{version.note}</span>}
                </span>
                {version.number === latest ? (
                  <span className="floor-menu__current">{t("floorplan-version-current")}</span>
                ) : (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      void store
                        .restoreFloorVersion(plan.id, current.id, version.number)
                        .catch(() => undefined);
                      onClose();
                    }}
                  >
                    {t("floorplan-version-restore")}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

export function FloorWorkbench({
  planId,
  check,
  threadTitle,
  onBack,
}: {
  planId: string;
  check: boolean;
  threadTitle: string;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const plan = useFloorPlan(planId);
  const { toast, show } = useToast();
  const [view, setView] = useState<FloorView>(check ? "size" : "furniture");
  const [side, setSide] = useState<Side>("rooms");
  const [selected, setSelected] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [menu, setMenu] = useState<"scheme" | "export" | null>(null);
  const [draft, setDraft] = useState("");

  if (!plan) {
    return (
      <main className="floor">
        <p className="trip__loading">{t("floorplan-loading")}</p>
      </main>
    );
  }
  const layout = currentLayout(plan);
  const target = compareTarget(plan);
  const shown = comparing && target ? target.layout : layout;
  const changed = comparing && target ? changedRooms(layout, target.layout) : [];
  const room = shown.rooms.find((candidate) => candidate.id === selected) ?? null;
  const pending = pendingMeasures(layout);
  const version = latestVersion(activeScheme(plan))?.number ?? 1;
  const views: { id: FloorView; label: string }[] = [
    { id: "plain", label: t("floorplan-view-plain") },
    { id: "furniture", label: t("floorplan-view-furniture") },
    { id: "size", label: t("floorplan-view-size") },
  ];
  const sent = () => show({ text: t("floorplan-sent") });
  const ask = (text: string, about: FloorRoom | null) => {
    const context: ContextNote[] = about
      ? [
          {
            label: t("floorplan-ask-label"),
            body: t("floorplan-ask-body", {
              title: plan.title,
              scheme: plan.scheme,
              room: about.name,
            }),
          },
        ]
      : [];
    const message = about ? t("floorplan-ask-message", { room: about.name, text }) : text;
    void store
      .send(plan.threadId, message, { context })
      .then(sent)
      .catch(() => undefined);
  };
  const exportDxf = async () => {
    setMenu(null);
    if (!isTauri()) return;
    try {
      const text = floorDxf(layout, (one) => one.name);
      const path = await join(await downloadDir(), fileName(plan.title, "dxf"));
      await store.saveExport(path, btoa(text));
      show({ text: t("floorplan-exported") });
    } catch {
      show({ text: t("floorplan-export-failed") });
    }
  };
  const meta = [
    t("floorplan-area", { area: areaText(planArea(plan, layout)) }),
    plan.kind,
    t("floorplan-rooms", { count: layout.rooms.length }),
  ]
    .filter(Boolean)
    .join(t("daily-dot"));

  return (
    <main className="floor">
      <section className="floor__main">
        <div className="floor__top">
          <button type="button" className="link-button floor__back" onClick={onBack}>
            {t("floorplan-back", { title: threadTitle })}
          </button>
          <span className="floor__spacer" />
          <div className="floor__anchor">
            <button
              type="button"
              className="floor__scheme"
              aria-expanded={menu === "scheme"}
              onClick={() => setMenu(menu === "scheme" ? null : "scheme")}
            >
              {t("floorplan-scheme-version", { scheme: plan.scheme, version })}
            </button>
            {menu === "scheme" && <SchemeMenu plan={plan} onClose={() => setMenu(null)} />}
          </div>
          {target && (
            <button
              type="button"
              className="button--line"
              aria-pressed={comparing}
              data-on={comparing || undefined}
              onClick={() => setComparing(!comparing)}
            >
              {comparing
                ? t("floorplan-compare-back", { scheme: plan.scheme })
                : target.sameScheme
                  ? t("floorplan-compare-version", { version: target.version })
                  : t("floorplan-compare", { scheme: target.scheme })}
            </button>
          )}
          <div className="floor__anchor">
            <button
              type="button"
              className="button--line"
              aria-expanded={menu === "export"}
              onClick={() => setMenu(menu === "export" ? null : "export")}
            >
              {t("floorplan-export")}
            </button>
            {menu === "export" && (
              <div className="floor-menu floor-menu--small" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(null);
                    window.setTimeout(() => window.print(), 50);
                  }}
                >
                  {t("floorplan-export-pdf")}
                </button>
                <button type="button" role="menuitem" onClick={() => void exportDxf()}>
                  {t("floorplan-export-dxf")}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="floor__views" role="tablist">
          {views.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === view}
              className="floor__view"
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {comparing && target && (
          <div className="floor__compare">
            <b>{t("floorplan-comparing", { scheme: target.scheme, version: target.version })}</b>
            <span>
              {changed.length > 0
                ? t("floorplan-compare-diff", {
                    rooms: changed.join(t("floorplan-compare-joiner")),
                  })
                : t("floorplan-compare-same")}
            </span>
          </div>
        )}
        <div className="floor__plan">
          <FloorCanvas
            layout={shown}
            view={view}
            label={plan.title}
            selected={selected}
            marked={changed}
            onPick={(picked) => {
              setSelected(picked.id === selected ? null : picked.id);
              setSide("rooms");
            }}
          />
        </div>
        <form
          className="floor__ask"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim()) return;
            ask(draft.trim(), room);
            setDraft("");
          }}
        >
          <input
            value={draft}
            placeholder={t("floorplan-ask-plan")}
            aria-label={t("floorplan-ask-plan")}
            onChange={(event) => setDraft(event.target.value)}
          />
        </form>
      </section>
      <aside className="floor__side">
        <div className="floor__tabs" role="tablist">
          {(["rooms", "progress"] as const).map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={side === id}
              onClick={() => setSide(id)}
            >
              {id === "rooms" ? t("floorplan-tab-rooms") : t("floorplan-tab-progress")}
            </button>
          ))}
        </div>
        {side === "progress" ? (
          <FloorProgress plan={plan} onSent={sent} />
        ) : (
          <div className="floor__rooms">
            {pending.length > 0 && (
              <div className="floor__pending">
                <b className="floor__section">
                  {t("floorplan-check-title", { count: pending.length })}
                </b>
                {pending.map((measure) => (
                  <MeasureRow key={measure.id} plan={plan} measure={measure} />
                ))}
              </div>
            )}
            {room ? (
              <RoomDetail key={room.id} room={room} onAsk={ask} />
            ) : (
              <p className="floor__hint">{t("floorplan-hint-tap")}</p>
            )}
            <b className="floor__section">{t("floorplan-rooms-list")}</b>
            <ul className="floor__list">
              {shown.rooms.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    aria-pressed={item.id === selected}
                    onClick={() => setSelected(item.id === selected ? null : item.id)}
                  >
                    <span className="floor__list-name">{item.name}</span>
                    <span className="floor__list-meta">{roomMeta(t, item)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
      <div className="floor-print">
        <h1>{plan.title}</h1>
        <p>
          {meta}
          {t("daily-dot")}
          {t("floorplan-scheme-version", { scheme: plan.scheme, version })}
        </p>
        <FloorCanvas
          layout={layout}
          view="furniture"
          className="floor-print__svg"
          label={plan.title}
        />
        <table>
          <tbody>
            {layout.rooms.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>
                  <div>{roomMeta(t, item)}</div>
                  {item.advice && <div>{item.advice}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {toast}
    </main>
  );
}
