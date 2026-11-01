import { invoke, isTauri } from "@tauri-apps/api/core";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type {
  ChartKind,
  Deck,
  FoundImage,
  Slide,
  SlideLayout,
  Transition,
} from "@xiaoban/protocol";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHub } from "../../app/hub.tsx";
import { KitchenChat } from "../life/KitchenChat.tsx";
import { useContextMenu } from "../menu/ContextMenu.tsx";
import { exportPngs, exportPptx } from "./deckExport.ts";
import { Present } from "./Present.tsx";
import { type Part, SlideView } from "./SlideView.tsx";

const LAYOUTS: SlideLayout[] = [
  "title",
  "bullets",
  "number",
  "chart",
  "two",
  "section",
  "flow",
  "timeline",
  "compare",
  "funnel",
  "icons",
  "quote",
];
const THEMES = ["blue", "green", "orange", "night"] as const;
const TRANSITIONS: Transition[] = ["fade", "push", "zoom", "none"];

function Popover({
  anchor,
  onClose,
  className,
  children,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  className: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const width = box.current?.offsetWidth ?? 300;
    setSpot({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: rect.bottom + 6,
    });
  }, [anchor]);
  useEffect(() => {
    const away = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!box.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={box} className={className} style={spot}>
      {children}
    </div>,
    document.body,
  );
}

function newId() {
  return crypto.randomUUID();
}

function itemsText(slide: Slide) {
  if (slide.layout === "two" || slide.layout === "compare")
    return slide.columns
      .map((column) => [column.title, ...column.items.map((item) => `- ${item}`)].join("\n"))
      .join("\n\n");
  return slide.items
    .map((item) => (item.note ? `${item.text} | ${item.note}` : item.text))
    .join("\n");
}

function withText(slide: Slide, text: string): Slide {
  if (slide.layout === "two" || slide.layout === "compare") {
    const columns = text
      .split(/\n\s*\n/)
      .slice(0, 2)
      .map((block) => {
        const [title = "", ...lines] = block.split("\n").filter((line) => line.trim());
        return {
          title: title.trim(),
          items: lines.map((line) => line.replace(/^-\s*/, "").trim()),
        };
      });
    return { ...slide, columns };
  }
  const items = text
    .split("\n")
    .filter((line) => line.trim())
    .map((line, index) => {
      const [main = "", note = ""] = line.split("|").map((part) => part.trim());
      const old = slide.items[index];
      return { text: main, note, icon: old?.icon ?? "", value: old?.value ?? "" };
    });
  return { ...slide, items };
}

function ImagePicker({
  anchor,
  onPick,
  onClose,
}: {
  anchor: HTMLElement;
  onPick: (image: FoundImage) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<FoundImage[]>([]);
  const [busy, setBusy] = useState(false);
  const search = () => {
    if (!query.trim()) return;
    setBusy(true);
    void store
      .searchImages(query.trim())
      .then(setFound)
      .catch(() => setFound([]))
      .finally(() => setBusy(false));
  };
  return (
    <Popover anchor={anchor} onClose={onClose} className="doc-pop deck-images">
      <div className="deck-images__bar">
        <input
          // biome-ignore lint/a11y/noAutofocus: opened to type keywords
          autoFocus
          value={query}
          placeholder={t("slides-image-placeholder")}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) search();
          }}
        />
        <button
          type="button"
          className="code-status-button"
          data-dark
          disabled={busy}
          onClick={search}
        >
          {t("slides-image-search")}
        </button>
      </div>
      <div className="deck-images__grid">
        {found.map((image) => (
          <button
            key={image.url}
            type="button"
            className="deck-images__item"
            title={image.credit}
            onClick={() => onPick(image)}
          >
            <img src={image.thumb} alt="" referrerPolicy="no-referrer" />
          </button>
        ))}
      </div>
      <span className="life-card__note">{t("slides-image-note")}</span>
    </Popover>
  );
}

export function DeckPage({
  deckId,
  action,
  onBack,
}: {
  deckId: string;
  action: "present" | "pptx" | "pdf" | null;
  onBack: () => void;
}) {
  const { t, locale } = useI18n();
  const store = useHub();
  const { deck: loaded } = useHubState(store);
  const openMenu = useContextMenu();
  const deck: Deck | null = loaded?.id === deckId ? loaded : null;
  const [current, setCurrent] = useState(0);
  const [part, setPart] = useState<Part | null>(null);
  const [editing, setEditing] = useState<{ part: Part; value: string } | null>(null);
  const [menu, setMenu] = useState<"layout" | "chart" | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [popover, setPopover] = useState<{
    kind: "versions" | "theme" | "export" | "image";
    anchor: HTMLElement;
  } | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null);
  const [width, setWidth] = useState(720);
  const stage = useRef<HTMLDivElement>(null);
  const big = useRef<HTMLDivElement>(null);
  const pngs = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  useEffect(() => {
    void store.openDeck(deckId).catch(() => undefined);
  }, [store, deckId]);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setWidth(Math.max(360, Math.min(960, element.clientWidth - 64))),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [deck?.id]);

  useEffect(() => {
    if (!deck || deck.writing || done.current || !action) return;
    done.current = true;
    if (action === "present") setPresenting(true);
    if (action === "pdf") setPrinting(true);
    if (action === "pptx")
      void exportPptx(store, deck)
        .then((path) => path && invoke("file_reveal", { path }))
        .catch(() => undefined);
  }, [deck, action, store]);

  useEffect(() => {
    if (!printing) return;
    const timer = window.setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [printing]);

  useEffect(() => {
    if (!drag || !deck) return;
    const move = (event: PointerEvent) => {
      const over = document
        .elementsFromPoint(event.clientX, event.clientY)
        .map((element) => element.closest<HTMLElement>("[data-thumb]"))
        .find(Boolean)?.dataset.thumb;
      setDrag((value) =>
        value ? { ...value, over: over === undefined ? null : Number(over) } : value,
      );
    };
    const up = () => {
      setDrag((value) => {
        if (value && value.over !== null && value.over !== value.from) {
          const slides = [...deck.slides];
          const [moved] = slides.splice(value.from, 1);
          if (moved) slides.splice(value.over, 0, moved);
          void store.setSlides(deck.id, slides).catch(() => undefined);
          setCurrent(value.over);
        }
        return null;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag?.from, deck, store]);

  if (!deck) return <main className="life-page deck" />;
  const index = Math.min(current, Math.max(0, deck.slides.length - 1));
  const slide = deck.slides[index];
  const replace = (next: Slide) =>
    void store
      .setSlides(
        deck.id,
        deck.slides.map((item, at) => (at === index ? next : item)),
      )
      .catch(() => undefined);
  const ask = (text: string) => {
    if (deck.threadId)
      void store
        .send(deck.threadId, t("slides-ask-page", { n: index + 1, text }))
        .catch(() => undefined);
    setPart(null);
    setAsking(null);
  };
  const themeLabel = (name: string) =>
    t(
      `slides-theme-${(THEMES as readonly string[]).includes(name) ? (name as (typeof THEMES)[number]) : "blue"}`,
    );
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const toolbarAt =
    part &&
    big.current?.querySelector<HTMLElement>(`[data-part="${part}"]`)?.getBoundingClientRect();

  const thumbMenu = (event: React.MouseEvent, at: number) => {
    event.preventDefault();
    openMenu(event, [
      {
        label: t("slides-duplicate"),
        onSelect: () => {
          const copy = deck.slides[at];
          if (!copy) return;
          const slides = [...deck.slides];
          slides.splice(at + 1, 0, { ...copy, id: newId() });
          void store.setSlides(deck.id, slides).catch(() => undefined);
        },
      },
      {
        label: t("slides-delete"),
        danger: true,
        disabled: deck.slides.length < 2,
        onSelect: () =>
          void store
            .setSlides(
              deck.id,
              deck.slides.filter((_, position) => position !== at),
            )
            .catch(() => undefined),
      },
    ]);
  };

  const changeCards = deck.changes.map((change) => {
    const after = deck.slides.find((item) => item.id === change.slideId);
    const page = deck.slides.findIndex((item) => item.id === change.slideId) + 1;
    if (!after) return null;
    return (
      <div key={change.slideId} className="doc-suggestion deck-change">
        <span className="life-card__note">
          {change.before
            ? t("slides-change-head", { n: page })
            : t("slides-change-new", { n: page })}
        </span>
        <div className="deck-change__pair">
          {change.before && <SlideView slide={change.before} theme={deck.theme} width={128} />}
          <button type="button" className="deck-change__after" onClick={() => setCurrent(page - 1)}>
            <SlideView slide={after} theme={deck.theme} width={128} />
          </button>
        </div>
        <div className="doc-suggestion__actions">
          <button
            type="button"
            className="code-status-button"
            data-dark
            onClick={() =>
              void store.resolveSlideChange(deck.id, change.slideId, true).catch(() => undefined)
            }
          >
            {t("slides-keep")}
          </button>
          <button
            type="button"
            className="code-link"
            onClick={() =>
              void store.resolveSlideChange(deck.id, change.slideId, false).catch(() => undefined)
            }
          >
            {change.before ? t("slides-undo") : t("slides-undo-new")}
          </button>
        </div>
      </div>
    );
  });

  return (
    <main className="life-page deck">
      <header className="doc-top">
        <button type="button" className="code-link" onClick={onBack}>
          {t("doc-back")}
        </button>
        <b className="doc-top__title">{deck.title}</b>
        {deck.version > 0 && (
          <button
            type="button"
            className="doc-top__version"
            onClick={(event) => setPopover({ kind: "versions", anchor: event.currentTarget })}
          >
            {t("doc-version", { version: deck.version })}
          </button>
        )}
        <button
          type="button"
          className="deck-top__theme"
          onClick={(event) => setPopover({ kind: "theme", anchor: event.currentTarget })}
        >
          {deck.writing
            ? t("slides-writing", {
                n: Math.min(deck.slides.length + 1, deck.outline.length),
                total: deck.outline.length,
              })
            : t("slides-top-meta", { pages: deck.slides.length, theme: themeLabel(deck.theme) })}
        </button>
        <span className="life-card__spacer" />
        <button
          type="button"
          className="code-status-button"
          disabled={deck.slides.length === 0}
          onClick={() => setPresenting(true)}
        >
          {t("slides-present")}
        </button>
        <button
          type="button"
          className="code-status-button"
          disabled={deck.writing || !isTauri()}
          onClick={() =>
            void exportPptx(store, deck)
              .then((path) => path && invoke("file_open", { path }))
              .catch(() => undefined)
          }
        >
          {t("slides-open-powerpoint")}
        </button>
        <button
          type="button"
          className="code-status-button"
          data-dark
          disabled={deck.writing}
          onClick={(event) => setPopover({ kind: "export", anchor: event.currentTarget })}
        >
          {t("doc-export")}
        </button>
      </header>
      <div className="doc__body">
        <nav className="deck-thumbs" aria-label={t("slides-pages")}>
          {deck.slides.map((item, at) => (
            <button
              key={item.id}
              type="button"
              className="deck-thumbs__item"
              data-thumb={at}
              aria-current={at === index}
              data-over={drag && drag.over === at && drag.from !== at ? true : undefined}
              onClick={() => {
                setCurrent(at);
                setPart(null);
              }}
              onPointerDown={(event) => {
                if (event.button === 0) setDrag({ from: at, over: null });
              }}
              onContextMenu={(event) => thumbMenu(event, at)}
            >
              <span className="deck-thumbs__no">{at + 1}</span>
              <SlideView slide={item} theme={deck.theme} width={168} />
            </button>
          ))}
          {deck.writing &&
            deck.outline.slice(deck.slides.length).map((title) => (
              <span key={title} className="deck-thumbs__pending">
                {title}
              </span>
            ))}
          {!deck.writing && (
            <button
              type="button"
              className="code-link deck-thumbs__add"
              onClick={() => {
                const blank: Slide = {
                  id: newId(),
                  layout: "bullets",
                  title: t("slides-new-title"),
                  subtitle: "",
                  items: [{ text: t("slides-new-point"), note: "", icon: "", value: "" }],
                  columns: [],
                  chart: null,
                  image: null,
                  notes: "",
                  still: false,
                };
                const slides = [...deck.slides];
                slides.splice(index + 1, 0, blank);
                void store.setSlides(deck.id, slides).catch(() => undefined);
                setCurrent(index + 1);
              }}
            >
              {t("slides-add")}
            </button>
          )}
        </nav>
        <section
          ref={stage}
          className="deck-stage"
          aria-label={deck.title}
          onMouseDown={() => setPart(null)}
        >
          {slide ? (
            <>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: double-click edits the selected part; the parts themselves are the targets */}
              <div
                ref={big}
                className="deck-stage__slide"
                onDoubleClick={() => {
                  if (!part || part === "chart" || part === "image") return;
                  setEditing({
                    part,
                    value:
                      part === "title"
                        ? slide.title
                        : part === "subtitle"
                          ? slide.subtitle
                          : itemsText(slide),
                  });
                }}
              >
                <SlideView
                  slide={slide}
                  theme={deck.theme}
                  width={width}
                  selected={part}
                  onPick={(picked) => {
                    setPart(picked);
                    setMenu(null);
                    setAsking(null);
                  }}
                />
              </div>
              <label className="deck-notes">
                <span>{t("slides-notes")}</span>
                <textarea
                  key={slide.id}
                  defaultValue={slide.notes}
                  placeholder={t("slides-notes-placeholder")}
                  onMouseDown={(event) => event.stopPropagation()}
                  onBlur={(event) => {
                    if (event.target.value !== slide.notes)
                      replace({ ...slide, notes: event.target.value });
                  }}
                />
              </label>
            </>
          ) : (
            <p className="life-card__hint">{t("slides-empty")}</p>
          )}
        </section>
        {deck.threadId && (
          <KitchenChat
            threadId={deck.threadId}
            labels={{
              title: t("kitchen-chat"),
              note: t("slides-chat-note"),
              hint: t("slides-chat-hint"),
              placeholder: t("slides-chat-placeholder", { n: index + 1 }),
            }}
            extra={changeCards}
          />
        )}
      </div>
      {slide &&
        part &&
        toolbarAt &&
        !editing &&
        !deck.writing &&
        createPortal(
          <div
            className="doc-toolbar"
            role="toolbar"
            style={{ left: Math.max(8, toolbarAt.left), top: Math.max(64, toolbarAt.top - 46) }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {asking !== null ? (
              <input
                // biome-ignore lint/a11y/noAutofocus: opened to type a request
                autoFocus
                className="doc-toolbar__input"
                value={asking}
                placeholder={t("doc-act-ask-placeholder")}
                onChange={(event) => setAsking(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing && asking.trim())
                    ask(asking.trim());
                  if (event.key === "Escape") setAsking(null);
                }}
              />
            ) : (
              <>
                {part === "chart" && slide.chart ? (
                  <>
                    {(["bar", "line", "pie"] as ChartKind[])
                      .filter((kind) => kind !== slide.chart?.kind)
                      .map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          onClick={() =>
                            slide.chart && replace({ ...slide, chart: { ...slide.chart, kind } })
                          }
                        >
                          {t(`slides-chart-${kind}`)}
                        </button>
                      ))}
                    <button
                      type="button"
                      onClick={() => {
                        if (!slide.chart) return;
                        const values = slide.chart.values.map(
                          (value) => Number(value.replace(/[,¥$%\s]/g, "")) || 0,
                        );
                        replace({
                          ...slide,
                          chart: { ...slide.chart, highlight: values.indexOf(Math.max(...values)) },
                        });
                      }}
                    >
                      {t("slides-highest")}
                    </button>
                  </>
                ) : part === "image" ? (
                  <>
                    <button
                      type="button"
                      onClick={(event) =>
                        setPopover({ kind: "image", anchor: event.currentTarget })
                      }
                    >
                      {t("slides-image-change")}
                    </button>
                    <button type="button" onClick={() => replace({ ...slide, image: null })}>
                      {t("slides-image-remove")}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        ask(t("slides-act-shorter", { part: t(`slides-part-${part}`) }))
                      }
                    >
                      {t("doc-act-shorter")}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        ask(t("slides-act-reword", { part: t(`slides-part-${part}`) }))
                      }
                    >
                      {t("slides-reword")}
                    </button>
                    {slide.layout === "bullets" && !slide.image && (
                      <button
                        type="button"
                        onClick={(event) =>
                          setPopover({ kind: "image", anchor: event.currentTarget })
                        }
                      >
                        {t("slides-image-add")}
                      </button>
                    )}
                  </>
                )}
                <span className="doc-toolbar__tone">
                  <button
                    type="button"
                    onClick={() => setMenu(menu === "layout" ? null : "layout")}
                  >
                    {t("slides-layout")}
                  </button>
                  {menu === "layout" && (
                    <span className="doc-toolbar__menu deck-layouts">
                      {LAYOUTS.map((layout) => (
                        <button
                          key={layout}
                          type="button"
                          aria-pressed={slide.layout === layout}
                          onClick={() => replace({ ...slide, layout })}
                        >
                          {t(`slides-layout-${layout}`)}
                        </button>
                      ))}
                    </span>
                  )}
                </span>
                <button type="button" onClick={() => setAsking("")}>
                  {t("doc-act-ask-more")}
                </button>
              </>
            )}
          </div>,
          document.body,
        )}
      {slide &&
        editing &&
        toolbarAt &&
        createPortal(
          <div
            className="deck-edit"
            style={{ left: Math.max(8, toolbarAt.left), top: Math.max(8, toolbarAt.top) }}
          >
            {editing.part === "body" ? (
              <textarea
                // biome-ignore lint/a11y/noAutofocus: editing starts at once
                autoFocus
                value={editing.value}
                onChange={(event) => setEditing({ ...editing, value: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setEditing(null);
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    replace(withText(slide, editing.value));
                    setEditing(null);
                  }
                }}
              />
            ) : (
              <input
                // biome-ignore lint/a11y/noAutofocus: editing starts at once
                autoFocus
                value={editing.value}
                onChange={(event) => setEditing({ ...editing, value: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setEditing(null);
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    replace(
                      editing.part === "title"
                        ? { ...slide, title: editing.value }
                        : { ...slide, subtitle: editing.value },
                    );
                    setEditing(null);
                  }
                }}
              />
            )}
            <span className="life-card__note">
              {editing.part === "body" ? t("slides-edit-body-hint") : t("slides-edit-hint")}
            </span>
            <div className="doc-suggestion__actions">
              <button
                type="button"
                className="code-status-button"
                data-dark
                onClick={() => {
                  replace(
                    editing.part === "title"
                      ? { ...slide, title: editing.value }
                      : editing.part === "subtitle"
                        ? { ...slide, subtitle: editing.value }
                        : withText(slide, editing.value),
                  );
                  setEditing(null);
                }}
              >
                {t("ledger-save")}
              </button>
              <button type="button" className="code-link" onClick={() => setEditing(null)}>
                {t("ledger-cancel")}
              </button>
            </div>
          </div>,
          document.body,
        )}
      {popover?.kind === "image" && slide && (
        <ImagePicker
          anchor={popover.anchor}
          onClose={() => setPopover(null)}
          onPick={(image) => {
            replace({
              ...slide,
              layout: "bullets",
              image: { url: image.url, credit: image.credit },
            });
            setPopover(null);
          }}
        />
      )}
      {popover?.kind === "versions" && (
        <Popover
          anchor={popover.anchor}
          onClose={() => setPopover(null)}
          className="doc-pop doc-versions"
        >
          {[...deck.versions].reverse().map((version) => (
            <button
              key={version.version}
              type="button"
              className="doc-versions__item"
              disabled={version.version === deck.version}
              onClick={() => {
                void store.restoreDeckVersion(deck.id, version.version).catch(() => undefined);
                setPopover(null);
              }}
            >
              <span>
                <b>{t("doc-version-name", { version: version.version })}</b>
                <span className="life-card__note">{version.note}</span>
              </span>
              <span className="life-card__note">{time.format(new Date(version.at))}</span>
            </button>
          ))}
          <span className="life-card__note deck-versions__hint">{t("slides-versions-hint")}</span>
        </Popover>
      )}
      {popover?.kind === "theme" && deck.slides[0] && (
        <Popover
          anchor={popover.anchor}
          onClose={() => setPopover(null)}
          className="doc-pop deck-themes"
        >
          <div className="deck-themes__grid">
            {THEMES.map((name) => (
              <button
                key={name}
                type="button"
                className="deck-themes__item"
                aria-pressed={deck.theme === name}
                onClick={() =>
                  void store.setSlides(deck.id, deck.slides, name).catch(() => undefined)
                }
              >
                {deck.slides[0] && <SlideView slide={deck.slides[0]} theme={name} width={150} />}
                <span>{themeLabel(name)}</span>
              </button>
            ))}
          </div>
          <div className="deck-themes__transitions">
            <span className="life-card__note">{t("slides-transition")}</span>
            {TRANSITIONS.map((name) => (
              <button
                key={name}
                type="button"
                className="code-status-button"
                data-dark={deck.transition === name || undefined}
                onClick={() =>
                  void store.setSlides(deck.id, deck.slides, null, name).catch(() => undefined)
                }
              >
                {t(`slides-transition-${name}`)}
              </button>
            ))}
          </div>
          <span className="life-card__note">{t("slides-theme-note")}</span>
        </Popover>
      )}
      {popover?.kind === "export" && (
        <Popover
          anchor={popover.anchor}
          onClose={() => setPopover(null)}
          className="doc-pop doc-export"
        >
          {(
            [
              [
                t("slides-format-pptx"),
                ".pptx",
                () =>
                  exportPptx(store, deck).then((path) => path && invoke("file_reveal", { path })),
              ],
              [t("slides-format-pdf"), ".pdf", async () => setPrinting(true)],
              [
                t("slides-format-png"),
                ".png",
                async () => {
                  const nodes = Array.from(
                    pngs.current?.querySelectorAll<HTMLElement>(".slide") ?? [],
                  );
                  const path = await exportPngs(store, deck, nodes);
                  if (path) await invoke("file_reveal", { path });
                },
              ],
            ] as const
          ).map(([label, ext, run]) => (
            <button
              key={label}
              type="button"
              className="doc-export__item"
              onClick={() => {
                setPopover(null);
                void run().catch(() => undefined);
              }}
            >
              <span>{label}</span>
              <span className="life-card__note">{ext}</span>
            </button>
          ))}
          <span className="life-card__note">{t("slides-export-note")}</span>
        </Popover>
      )}
      <div
        ref={pngs}
        className="deck-print"
        data-printing={printing || undefined}
        aria-hidden="true"
      >
        {deck.slides.map((item) => (
          <div key={item.id} className="deck-print__page">
            <SlideView slide={item} theme={deck.theme} width={960} />
          </div>
        ))}
      </div>
      {presenting && <Present deck={deck} start={index} onClose={() => setPresenting(false)} />}
    </main>
  );
}
