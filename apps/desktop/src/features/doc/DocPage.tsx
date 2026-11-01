import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { BlockKind, Doc, DocBlock } from "@xiaoban/protocol";
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useHub } from "../../app/hub.tsx";
import { KitchenChat } from "../life/KitchenChat.tsx";
import { countChars, openInWord, plainText, revealExport } from "./docFiles.ts";

const ESCAPE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

function toHtml(text: string) {
  const safe = text.replace(/[&<>"]/g, (char) => ESCAPE[char] ?? char);
  return safe.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

function fromDom(node: Node): string {
  let out = "";
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) out += child.textContent ?? "";
    else if (child instanceof HTMLElement) {
      if (child.tagName === "BR") continue;
      const inner = fromDom(child);
      out +=
        child.tagName === "B" || child.tagName === "STRONG"
          ? inner.trim()
            ? `**${inner}**`
            : inner
          : inner;
    }
  }
  return out.replace(/ /g, " ");
}

function newId() {
  return crypto.randomUUID();
}

function Block({
  block,
  number,
  marked,
  removed,
  readOnly,
  onSave,
  onKey,
  onMark,
}: {
  block: DocBlock;
  number: number;
  marked: boolean;
  removed?: boolean;
  readOnly: boolean;
  onSave: (id: string, text: string) => void;
  onKey: (event: React.KeyboardEvent<HTMLElement>, block: DocBlock) => void;
  onMark: (keep: boolean) => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element && document.activeElement !== element) element.innerHTML = toHtml(block.text);
  }, [block.text]);
  return (
    <div
      className="doc-block"
      data-kind={block.kind}
      data-marked={marked || undefined}
      data-removed={removed || undefined}
      data-block={block.id}
    >
      {block.kind === "bullet" && <span className="doc-block__bullet" data-dot />}
      {block.kind === "number" && <span className="doc-block__bullet">{`${number}.`}</span>}
      <div className="doc-block__line">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: rich text with bold needs a contentEditable block */}
        <span
          ref={ref}
          className="doc-block__text"
          tabIndex={readOnly ? -1 : 0}
          contentEditable={!readOnly}
          suppressContentEditableWarning
          spellCheck={false}
          onBlur={(event) => onSave(block.id, fromDom(event.currentTarget))}
          onKeyDown={(event) => onKey(event, block)}
        />
      </div>
      {marked && !readOnly && (
        <span className="doc-block__mark">
          <button type="button" className="code-link" onClick={() => onMark(false)}>
            {t("doc-mark-undo")}
          </button>
          <button type="button" className="code-link" onClick={() => onMark(true)}>
            {t("doc-mark-keep")}
          </button>
        </span>
      )}
    </div>
  );
}

function Popover({
  anchor,
  onClose,
  children,
  className,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  children: ReactNode;
  className: string;
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

type Selection = { blockId: string; text: string; left: number; top: number };

function Toolbar({
  selection,
  onAsk,
}: {
  selection: Selection;
  onAsk: (action: string, extra?: string) => void;
}) {
  const { t } = useI18n();
  const [tone, setTone] = useState(false);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const actions = [
    t("doc-act-plain"),
    t("doc-act-shorter"),
    t("doc-act-longer"),
    t("doc-act-example"),
  ];
  return createPortal(
    <div
      className="doc-toolbar"
      role="toolbar"
      style={{ left: selection.left, top: selection.top }}
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
      }}
    >
      {asking ? (
        <input
          // biome-ignore lint/a11y/noAutofocus: opened to type a question
          autoFocus
          className="doc-toolbar__input"
          value={question}
          placeholder={t("doc-act-ask-placeholder")}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing && question.trim())
              onAsk(t("doc-act-ask"), question.trim());
            if (event.key === "Escape") setAsking(false);
          }}
        />
      ) : (
        <>
          {actions.map((action) => (
            <button key={action} type="button" onClick={() => onAsk(action)}>
              {action}
            </button>
          ))}
          <span className="doc-toolbar__tone">
            <button type="button" onClick={() => setTone(!tone)}>
              {t("doc-act-tone")}
            </button>
            {tone && (
              <span className="doc-toolbar__menu">
                {[t("doc-tone-formal"), t("doc-tone-warm"), t("doc-tone-simple")].map((item) => (
                  <button key={item} type="button" onClick={() => onAsk(item)}>
                    {item}
                  </button>
                ))}
              </span>
            )}
          </span>
          <button type="button" onClick={() => setAsking(true)}>
            {t("doc-act-ask-more")}
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}

function Outline({
  doc,
  onJump,
  onMove,
}: {
  doc: Doc;
  onJump: (id: string) => void;
  onMove: (from: string, to: string) => void;
}) {
  const { t } = useI18n();
  const sections = doc.blocks.filter((block) => block.kind === "h2");
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null);
  useEffect(() => {
    if (!drag) return;
    const move = (event: PointerEvent) => {
      const over = document
        .elementsFromPoint(event.clientX, event.clientY)
        .map((element) => element.closest<HTMLElement>("[data-section]"))
        .find(Boolean)?.dataset.section;
      setDrag((current) => (current ? { ...current, over: over ?? null } : current));
    };
    const up = () => {
      setDrag((current) => {
        if (current?.over && current.over !== current.id) onMove(current.id, current.over);
        return null;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag?.id, onMove]);
  return (
    <nav className="doc-outline" aria-label={t("doc-outline")}>
      <span className="doc-outline__title">{t("doc-outline")}</span>
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          className="doc-outline__item"
          data-section={section.id}
          data-over={drag?.over === section.id && drag.id !== section.id ? true : undefined}
          data-dragging={drag?.id === section.id || undefined}
          onClick={() => onJump(section.id)}
          onPointerDown={(event) => {
            if (event.button === 0) setDrag({ id: section.id, over: null });
          }}
        >
          {section.text}
        </button>
      ))}
      {doc.writing &&
        doc.outline.slice(sections.length).map((title) => (
          <span key={title} className="doc-outline__item" data-pending>
            {title}
          </span>
        ))}
      {sections.length > 1 && <span className="doc-outline__hint">{t("doc-outline-hint")}</span>}
    </nav>
  );
}

function moveSection(blocks: DocBlock[], from: string, to: string): DocBlock[] {
  const range = (id: string) => {
    const start = blocks.findIndex((block) => block.id === id);
    let end = start + 1;
    while (end < blocks.length && blocks[end]?.kind !== "h2" && blocks[end]?.kind !== "h1")
      end += 1;
    return [start, end] as const;
  };
  const [start, end] = range(from);
  if (start < 0) return blocks;
  const moving = blocks.slice(start, end);
  const rest = [...blocks.slice(0, start), ...blocks.slice(end)];
  const target = rest.findIndex((block) => block.id === to);
  if (target < 0) return blocks;
  const after = blocks.findIndex((block) => block.id === to) > start;
  let at = target;
  if (after) {
    at = target + 1;
    while (at < rest.length && rest[at]?.kind !== "h2") at += 1;
  }
  return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
}

export function DocPage({
  docId,
  print,
  onBack,
}: {
  docId: string;
  print: boolean;
  onBack: () => void;
}) {
  const { t, locale } = useI18n();
  const store = useHub();
  const { doc } = useHubState(store);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [versions, setVersions] = useState<HTMLElement | null>(null);
  const [exporting, setExporting] = useState<HTMLElement | null>(null);
  const [compare, setCompare] = useState<{
    version: number;
    blocks: DocBlock[];
    previous: DocBlock[];
  } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const paper = useRef<HTMLDivElement>(null);
  const printed = useRef(false);
  const current = doc?.id === docId ? doc : null;

  useEffect(() => {
    void store.openDoc(docId).catch(() => undefined);
  }, [store, docId]);

  useEffect(() => {
    if (print && current && !current.writing && !printed.current) {
      printed.current = true;
      window.setTimeout(() => window.print(), 300);
    }
  }, [print, current]);

  const save = useCallback(
    (blocks: DocBlock[]) => {
      if (current) void store.setDocBlocks(current.id, blocks).catch(() => undefined);
    },
    [store, current],
  );

  const saveText = (id: string, text: string) => {
    if (!current) return;
    const block = current.blocks.find((item) => item.id === id);
    if (!block || block.text === text) return;
    let next = { ...block, text };
    if (block.kind === "p" && text.startsWith("- "))
      next = { ...next, kind: "bullet", text: text.slice(2) };
    save(current.blocks.map((item) => (item.id === id ? next : item)));
  };

  const focusBlock = (id: string, atEnd = true) =>
    window.setTimeout(() => {
      const element = paper.current?.querySelector<HTMLElement>(
        `[data-block="${id}"] .doc-block__text`,
      );
      if (!element) return;
      element.focus();
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(!atEnd);
      const selected = window.getSelection();
      selected?.removeAllRanges();
      selected?.addRange(range);
    }, 30);

  const onKey = (event: React.KeyboardEvent<HTMLElement>, block: DocBlock) => {
    if (!current) return;
    const meta = event.metaKey || event.ctrlKey;
    const text = fromDom(event.currentTarget);
    const setKind = (kind: BlockKind) => {
      event.preventDefault();
      save(current.blocks.map((item) => (item.id === block.id ? { ...item, kind, text } : item)));
    };
    if (meta && event.key === "b") {
      event.preventDefault();
      document.execCommand("bold");
      return;
    }
    if (meta && event.key === "1") return setKind("h2");
    if (meta && event.key === "2") return setKind("h3");
    if (meta && event.key === "0") return setKind("p");
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const kind: BlockKind = block.kind === "bullet" || block.kind === "number" ? block.kind : "p";
      const fresh: DocBlock = { id: newId(), kind, text: "" };
      const index = current.blocks.findIndex((item) => item.id === block.id);
      const next = current.blocks.map((item) => (item.id === block.id ? { ...item, text } : item));
      next.splice(index + 1, 0, fresh);
      save(next);
      focusBlock(fresh.id);
      return;
    }
    if (event.key === "Backspace" && text === "" && block.kind !== "h1") {
      event.preventDefault();
      const index = current.blocks.findIndex((item) => item.id === block.id);
      const previous = current.blocks[index - 1];
      if (block.kind !== "p")
        return save(
          current.blocks.map((item) => (item.id === block.id ? { ...item, kind: "p" } : item)),
        );
      save(current.blocks.filter((item) => item.id !== block.id));
      if (previous) focusBlock(previous.id);
    }
  };

  const onMouseUp = () => {
    const selected = window.getSelection();
    const text = selected?.toString().trim() ?? "";
    if (!selected || !text || selected.rangeCount === 0) return setSelection(null);
    const anchor =
      selected.anchorNode instanceof HTMLElement
        ? selected.anchorNode
        : selected.anchorNode?.parentElement;
    const blockId = anchor?.closest<HTMLElement>("[data-block]")?.dataset.block;
    if (!blockId) return setSelection(null);
    const rect = selected.getRangeAt(0).getBoundingClientRect();
    setSelection({ blockId, text, left: Math.max(8, rect.left), top: Math.max(8, rect.top - 46) });
  };

  const ask = (action: string, question?: string) => {
    if (!current?.threadId || !selection) return;
    const block = current.blocks.find((item) => item.id === selection.blockId);
    void store
      .send(
        current.threadId,
        question ? t("doc-ask-question", { question }) : t("doc-ask-action", { action }),
        {
          context: [
            {
              label: t("doc-selected-label"),
              body: t("doc-selected-body", {
                id: selection.blockId,
                selected: selection.text,
                paragraph: block?.text ?? "",
                action,
              }),
            },
          ],
        },
      )
      .catch(() => undefined);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const openCompare = async (version: number) => {
    if (!current) return;
    const blocks = await store.docVersionBlocks(current.id, version);
    const previous = version > 1 ? await store.docVersionBlocks(current.id, version - 1) : [];
    setCompare({ version, blocks, previous });
    setVersions(null);
  };

  if (!current) return <main className="life-page doc" />;

  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const marked = new Set(current.marks.map((mark) => mark.blockId));
  const shown = compare ? compare.blocks : current.blocks;
  const previousText = new Map(compare?.previous.map((block) => [block.id, block.text]));
  const removed = compare
    ? compare.previous.filter((block) => !compare.blocks.some((item) => item.id === block.id))
    : [];
  let number = 0;

  const suggestions = current.suggestions.map((item) => (
    <div key={item.id} className="doc-suggestion">
      <span className="life-card__note">
        {t("doc-suggestion-head", {
          action: item.action,
          where: current.blocks.find((block) => block.id === item.blockId)?.text.slice(0, 12) ?? "",
        })}
      </span>
      <p className="doc-suggestion__before">{item.before.replaceAll("**", "")}</p>
      <p className="doc-suggestion__after">{item.after.replaceAll("**", "")}</p>
      <div className="doc-suggestion__actions">
        <button
          type="button"
          className="code-status-button"
          data-dark
          onClick={() =>
            void store.resolveSuggestion(current.id, item.id, true).catch(() => undefined)
          }
        >
          {t("doc-use")}
        </button>
        <button
          type="button"
          className="code-status-button"
          onClick={() => {
            if (current.threadId)
              void store
                .send(current.threadId, t("doc-another"), {
                  context: [
                    {
                      label: t("doc-selected-label"),
                      body: t("doc-selected-body", {
                        id: item.blockId,
                        selected: item.before,
                        paragraph: item.before,
                        action: item.action,
                      }),
                    },
                  ],
                })
                .catch(() => undefined);
          }}
        >
          {t("doc-another-button")}
        </button>
        <button
          type="button"
          className="code-link"
          onClick={() =>
            void store.resolveSuggestion(current.id, item.id, false).catch(() => undefined)
          }
        >
          {t("doc-keep-original")}
        </button>
      </div>
    </div>
  ));

  return (
    <main className="life-page doc">
      <header className="doc-top">
        <button type="button" className="code-link" onClick={onBack}>
          {t("doc-back")}
        </button>
        <b className="doc-top__title">{current.title}</b>
        {current.version > 0 && (
          <button
            type="button"
            className="doc-top__version"
            onClick={(event) => setVersions(versions ? null : event.currentTarget)}
          >
            {t("doc-version", { version: current.version })}
          </button>
        )}
        <span className="life-card__note">
          {current.writing
            ? t("doc-writing", {
                n: Math.min(current.written + 1, current.outline.length),
                total: current.outline.length,
              })
            : t("doc-saved", { chars: countChars(current.blocks) })}
        </span>
        <span className="life-card__spacer" />
        <button
          type="button"
          className="code-status-button"
          disabled={current.writing}
          onClick={() => void openInWord(store, current.id, current.title).catch(() => undefined)}
        >
          {t("doc-open-word")}
        </button>
        <button
          type="button"
          className="code-status-button"
          data-dark
          disabled={current.writing}
          onClick={(event) => setExporting(exporting ? null : event.currentTarget)}
        >
          {t("doc-export")}
        </button>
      </header>
      <div className="doc__body">
        <Outline
          doc={current}
          onJump={(id) =>
            paper.current
              ?.querySelector(`[data-block="${id}"]`)
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          onMove={(from, to) => save(moveSection(current.blocks, from, to))}
        />
        <section className="doc__desk" aria-label={current.title} onMouseUp={onMouseUp}>
          {compare && (
            <div className="doc-compare">
              {t("doc-comparing", { version: compare.version, previous: compare.version - 1 })}
              <button type="button" className="code-link" onClick={() => setCompare(null)}>
                {t("doc-compare-exit")}
              </button>
            </div>
          )}
          <div ref={paper} className="doc-paper">
            {shown.map((block, index) => {
              number = block.kind === "number" ? number + 1 : 0;
              const changed = compare
                ? previousText.get(block.id) !== block.text
                : marked.has(block.id);
              return (
                <div key={block.id}>
                  <Block
                    block={block}
                    number={number}
                    marked={changed && !(compare && compare.version === 1)}
                    readOnly={Boolean(compare) || current.writing}
                    onSave={saveText}
                    onKey={onKey}
                    onMark={(keep) =>
                      void store.resolveMark(current.id, block.id, keep).catch(() => undefined)
                    }
                  />
                  {index === 0 && block.kind === "h1" && current.subtitle && (
                    <span className="doc-paper__sub">{current.subtitle}</span>
                  )}
                </div>
              );
            })}
            {removed.map((block) => (
              <Block
                key={`removed-${block.id}`}
                block={block}
                number={0}
                marked={false}
                removed
                readOnly
                onSave={() => undefined}
                onKey={() => undefined}
                onMark={() => undefined}
              />
            ))}
            {current.writing &&
              current.outline.slice(current.written).map((title) => (
                <div key={title} className="doc-paper__pending">
                  <span>{title}</span>
                  <span className="doc-paper__shimmer" />
                  <span className="doc-paper__shimmer" data-short />
                </div>
              ))}
          </div>
        </section>
        {current.threadId && (
          <KitchenChat
            threadId={current.threadId}
            labels={{
              title: t("kitchen-chat"),
              note: t("doc-chat-note"),
              hint: t("doc-chat-hint"),
              placeholder: t("doc-chat-placeholder"),
            }}
            extra={suggestions}
          />
        )}
      </div>
      {selection && !compare && !current.writing && <Toolbar selection={selection} onAsk={ask} />}
      {versions && (
        <Popover
          anchor={versions}
          onClose={() => setVersions(null)}
          className="doc-pop doc-versions"
        >
          {[...current.versions].reverse().map((version) => (
            <button
              key={version.version}
              type="button"
              className="doc-versions__item"
              aria-pressed={(picked ?? current.version) === version.version}
              onClick={() => setPicked(version.version)}
            >
              <span>
                <b>{t("doc-version-name", { version: version.version })}</b>
                <span className="life-card__note">{version.note}</span>
              </span>
              <span className="life-card__note">{time.format(new Date(version.at))}</span>
            </button>
          ))}
          <div className="doc-versions__actions">
            <button
              type="button"
              className="code-link"
              disabled={(picked ?? current.version) <= 1}
              onClick={() => void openCompare(picked ?? current.version).catch(() => undefined)}
            >
              {t("doc-compare")}
            </button>
            <button
              type="button"
              className="code-link"
              disabled={(picked ?? current.version) === current.version}
              onClick={() => {
                void store
                  .restoreDocVersion(current.id, picked ?? current.version)
                  .catch(() => undefined);
                setVersions(null);
                setPicked(null);
              }}
            >
              {t("doc-restore")}
            </button>
          </div>
        </Popover>
      )}
      {exporting && (
        <Popover
          anchor={exporting}
          onClose={() => setExporting(null)}
          className="doc-pop doc-export"
        >
          {(
            [
              [
                t("doc-format-word"),
                ".docx",
                () => revealExport(store, current.id, current.title, "docx"),
              ],
              [t("doc-format-pdf"), ".pdf", async () => window.print()],
              [
                t("doc-format-md"),
                ".md",
                () => revealExport(store, current.id, current.title, "markdown"),
              ],
              [
                t("doc-format-copy"),
                "",
                () => navigator.clipboard.writeText(plainText(current.blocks)),
              ],
            ] as const
          ).map(([label, ext, run]) => (
            <button
              key={label}
              type="button"
              className="doc-export__item"
              onClick={() => {
                setExporting(null);
                void run().catch(() => undefined);
              }}
            >
              <span>{label}</span>
              <span className="life-card__note">{ext}</span>
            </button>
          ))}
          <span className="life-card__note">{t("doc-export-note")}</span>
        </Popover>
      )}
    </main>
  );
}
