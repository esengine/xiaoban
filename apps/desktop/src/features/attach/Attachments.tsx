import { invoke, isTauri } from "@tauri-apps/api/core";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { FileInfo } from "@xiaoban/protocol";
import { type MouseEvent, useEffect, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { type MenuEntry, useContextMenu } from "../menu/ContextMenu.tsx";
import { bytesOf, toPng, useImageViewer } from "../viewer/ImageViewer.tsx";
import type { Attached } from "./useAttachments.ts";

type Kind = "pdf" | "doc" | "sheet" | "text" | "file";

const KINDS: Record<string, Kind> = {
  pdf: "pdf",
  doc: "doc",
  docx: "doc",
  xls: "sheet",
  xlsx: "sheet",
  xlsm: "sheet",
  ods: "sheet",
  csv: "sheet",
  txt: "text",
  md: "text",
  json: "text",
};

function kindOf(name: string): { kind: Kind; tag: string } {
  const ext = name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";
  return { kind: KINDS[ext] ?? "file", tag: ext.slice(0, 4).toUpperCase() || "FILE" };
}

function size(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

function Remove({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="attach__remove" aria-label={label} onClick={onClick}>
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M7 7l10 10M17 7L7 17" />
      </svg>
    </button>
  );
}

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const shortcut = (mac: string, other: string) => (MAC ? mac : other);

type Locate = () => Promise<string>;

function act(locate: Locate, command: string, extra: Record<string, unknown> = {}) {
  if (!isTauri()) return;
  void locate()
    .then((path) => invoke(command, { path, ...extra }))
    .catch(() => undefined);
}

function useFileMenu() {
  const { t } = useI18n();
  const openMenu = useContextMenu();
  const reveal = (locate: Locate): MenuEntry => ({
    label: MAC ? t("file-menu-reveal-mac") : t("file-menu-reveal-windows"),
    shortcut: shortcut("⌘⇧R", "Ctrl+Shift+R"),
    hotkey: { key: "r", command: true, shift: true },
    onSelect: () => act(locate, "file_reveal"),
  });
  const forFile = (
    event: MouseEvent,
    name: string,
    locate: Locate,
    lookAgain: (() => void) | undefined,
  ) => {
    const entries: MenuEntry[] = [
      {
        label: t("file-menu-open"),
        shortcut: "↩",
        onSelect: () => act(locate, "file_open"),
      },
      reveal(locate),
      {
        label: t("file-menu-copy"),
        shortcut: shortcut("⌘C", "Ctrl+C"),
        hotkey: { key: "c", command: true },
        onSelect: () => act(locate, "file_copy"),
      },
      {
        label: t("file-menu-save-as"),
        shortcut: shortcut("⌘S", "Ctrl+S"),
        hotkey: { key: "s", command: true },
        onSelect: () => act(locate, "file_save_as", { name }),
      },
    ];
    if (lookAgain) {
      entries.push("separator", { label: t("file-menu-look-again"), onSelect: lookAgain });
    }
    openMenu(event, entries);
  };
  const forImage = (
    event: MouseEvent,
    name: string,
    src: () => Promise<string>,
    locate: Locate,
    zoom: () => void,
  ) => {
    openMenu(event, [
      {
        label: t("image-menu-zoom"),
        shortcut: t("menu-key-space"),
        hotkey: { key: " " },
        onSelect: zoom,
      },
      {
        label: MAC ? t("image-menu-preview-mac") : t("image-menu-preview-windows"),
        onSelect: () => act(locate, "file_open"),
      },
      reveal(locate),
      {
        label: t("image-menu-copy"),
        shortcut: shortcut("⌘C", "Ctrl+C"),
        hotkey: { key: "c", command: true },
        onSelect: () =>
          void src()
            .then(bytesOf)
            .then(({ blob }) => (blob.type === "image/png" ? blob : toPng(blob)))
            .then((png) => navigator.clipboard.write([new ClipboardItem({ "image/png": png })]))
            .catch(() => undefined),
      },
      {
        label: t("image-menu-download"),
        onSelect: () =>
          void src()
            .then(bytesOf)
            .then(({ bytes }) => isTauri() && invoke("save_image", { name, bytes }))
            .catch(() => undefined),
      },
    ]);
  };
  return { forFile, forImage };
}

function FileCard({
  name,
  meta,
  onRemove,
  locate,
  onLookAgain,
}: {
  name: string;
  meta: string;
  onRemove?: () => void;
  locate?: Locate;
  onLookAgain?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  const menu = useFileMenu();
  const { kind, tag } = kindOf(name);
  const body = (
    <>
      <span className="attach__tag" data-kind={kind}>
        {tag}
      </span>
      <span className="attach__meta">
        <span className="attach__name">{name}</span>
        <span className="attach__detail">{meta}</span>
      </span>
    </>
  );
  return (
    <span className="attach__card">
      {locate ? (
        <button
          type="button"
          className="attach__file attach__file--open"
          aria-label={t("file-open-label", { name })}
          onClick={() => act(locate, "file_open")}
          onContextMenu={(event) => menu.forFile(event, name, locate, onLookAgain)}
        >
          {body}
          <span className="attach__open">{t("file-open-hint")}</span>
        </button>
      ) : (
        <span className="attach__file">{body}</span>
      )}
      {onRemove && <Remove onClick={onRemove} label={t("attach-remove", { name })} />}
    </span>
  );
}

export function AttachRow({
  files,
  onRemove,
}: {
  files: Attached[];
  onRemove: (key: string) => void;
}) {
  const { t } = useI18n();
  const show = useImageViewer();
  const menu = useFileMenu();
  if (files.length === 0) return null;
  const zoom = (file: Attached, target: Element) => {
    const images = files.filter((item) => item.image && item.preview);
    show(
      images.map((item) => ({ src: item.preview ?? "", name: item.name })),
      images.indexOf(file),
      target,
    );
  };
  return (
    <div className="attach__row">
      {files.map((file) => {
        const problem =
          file.problem === "too-big"
            ? t("attach-too-big")
            : file.problem === "too-many"
              ? t("attach-too-many")
              : null;
        return (
          <span key={file.key} className="attach__item" data-problem={problem ? true : undefined}>
            {file.image && file.preview ? (
              <span className="attach__thumb">
                <button
                  type="button"
                  className="attach__zoom"
                  aria-label={t("viewer-open", { name: file.name })}
                  onClick={(event) => zoom(file, event.currentTarget)}
                  onContextMenu={(event) => {
                    const target = event.currentTarget;
                    menu.forImage(
                      event,
                      file.name,
                      async () => file.preview ?? "",
                      async () => file.path,
                      () => zoom(file, target),
                    );
                  }}
                >
                  <img src={file.preview} alt={file.name} />
                </button>
                <Remove
                  onClick={() => onRemove(file.key)}
                  label={t("attach-remove", { name: file.name })}
                />
              </span>
            ) : (
              <FileCard
                name={file.name}
                meta={size(file.size)}
                onRemove={() => onRemove(file.key)}
                locate={async () => file.path}
              />
            )}
            {problem && <span className="attach__problem">{problem}</span>}
          </span>
        );
      })}
    </div>
  );
}

export type VisionChoice = "auto" | "ask" | "none";

export function useVisionChoice(): VisionChoice {
  const { model } = useHubState(useHub());
  if (!model) return "none";
  if (model.provider === "deepseek") return "auto";
  if (model.provider === "mimo" && model.model.includes("pro")) return "ask";
  return "none";
}

export function VisionNotice({
  choice,
  accepted,
  onAccept,
  onTextOnly,
}: {
  choice: VisionChoice;
  accepted: boolean;
  onAccept: () => void;
  onTextOnly: () => void;
}) {
  const { t } = useI18n();
  if (choice === "auto") {
    return (
      <div className="attach__notice">
        <span className="attach__dot" aria-hidden="true" />
        {t("attach-vision-deepseek")}
      </div>
    );
  }
  if (choice === "ask" && !accepted) {
    return (
      <div className="attach__ask" role="alert">
        <span>{t("attach-vision-mimo")}</span>
        <button type="button" className="attach__ask-yes" onClick={onAccept}>
          {t("attach-vision-switch")}
        </button>
        <button type="button" className="attach__ask-no" onClick={onTextOnly}>
          {t("attach-vision-text-only")}
        </button>
      </div>
    );
  }
  return null;
}

export function DropZone({ count }: { count: number }) {
  const { t } = useI18n();
  return (
    <div className="drop-zone" aria-live="polite">
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 15V4M7 9l5-5 5 5" />
        <path d="M4 15v4a1 1 0 001 1h14a1 1 0 001-1v-4" />
      </svg>
      <b>{t("attach-drop", { count })}</b>
      <span>{t("attach-drop-hint")}</span>
    </div>
  );
}

const imageCache = new Map<string, Promise<string>>();

function loadImage(store: ReturnType<typeof useHub>, file: FileInfo): Promise<string> {
  const pending = imageCache.get(file.id) ?? store.fileData(file.id);
  imageCache.set(file.id, pending);
  pending.catch(() => imageCache.delete(file.id));
  return pending;
}

function SentImage({ file, onOpen }: { file: FileInfo; onOpen: (target: Element) => void }) {
  const { t } = useI18n();
  const store = useHub();
  const menu = useFileMenu();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void loadImage(store, file)
      .then((loaded) => alive && setUrl(loaded))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [file.id, store]);
  return (
    <button
      type="button"
      className="sent-files__image"
      aria-label={t("viewer-open", { name: file.name })}
      onClick={(event) => onOpen(event.currentTarget)}
      onContextMenu={(event) => {
        const target = event.currentTarget;
        menu.forImage(
          event,
          file.name,
          () => loadImage(store, file),
          () => store.filePath(file.id, file.name),
          () => onOpen(target),
        );
      }}
    >
      {url && <img src={url} alt={file.name} />}
    </button>
  );
}

const SHEET_FILE = /\.(xlsx|xls|csv)$/i;

export function SentFiles({
  files,
  onLookAgain,
  onOpenSheet,
}: {
  files: FileInfo[];
  onLookAgain?: ((file: FileInfo, path: string) => void) | undefined;
  onOpenSheet?: ((file: FileInfo) => void) | undefined;
}) {
  const { t } = useI18n();
  const store = useHub();
  const show = useImageViewer();
  if (files.length === 0) return null;
  const images = files.filter((file) => file.mode === "image");
  const documents = files.filter((file) => file.mode !== "image");
  const columns = images.length === 1 ? 1 : images.length <= 4 ? 2 : 3;
  const meta = (file: FileInfo) => {
    const pages = file.pages ?? 0;
    if (file.mode === "full") return t("attach-read-full", { pages });
    if (file.mode === "on_demand") return t("attach-read-on-demand", { pages });
    return t("attach-unreadable");
  };
  return (
    <div className="sent-files">
      {images.length > 0 && (
        <div className="sent-files__images" data-columns={columns}>
          {images.map((file) => (
            <SentImage
              key={file.id}
              file={file}
              onOpen={(target) =>
                void Promise.all(images.map((image) => loadImage(store, image))).then((urls) =>
                  show(
                    images.map((image, position) => ({
                      src: urls[position] ?? "",
                      name: image.name,
                    })),
                    images.indexOf(file),
                    target,
                  ),
                )
              }
            />
          ))}
        </div>
      )}
      {documents.map((file) => (
        <span key={file.id} className="sent-files__row">
          <FileCard
            name={file.name}
            meta={meta(file)}
            locate={() => store.filePath(file.id, file.name)}
            onLookAgain={
              onLookAgain &&
              (() =>
                void store
                  .filePath(file.id, file.name)
                  .then((path) => onLookAgain(file, path))
                  .catch(() => undefined))
            }
          />
          {onOpenSheet && SHEET_FILE.test(file.name) && (
            <button type="button" className="code-status-button" onClick={() => onOpenSheet(file)}>
              {t("sheet-open-in-xiaoban")}
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
