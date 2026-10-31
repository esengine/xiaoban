import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { FileInfo } from "@xiaoban/protocol";
import { useEffect, useState } from "react";
import { useHub } from "../../app/hub.tsx";
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

function FileCard({ name, meta, onRemove }: { name: string; meta: string; onRemove?: () => void }) {
  const { t } = useI18n();
  const { kind, tag } = kindOf(name);
  return (
    <span className="attach__file">
      <span className="attach__tag" data-kind={kind}>
        {tag}
      </span>
      <span className="attach__meta">
        <span className="attach__name">{name}</span>
        <span className="attach__detail">{meta}</span>
      </span>
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
  if (files.length === 0) return null;
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
                <img src={file.preview} alt={file.name} />
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

function SentImage({ file }: { file: FileInfo }) {
  const store = useHub();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const pending = imageCache.get(file.id) ?? store.fileData(file.id);
    imageCache.set(file.id, pending);
    void pending.then((loaded) => alive && setUrl(loaded)).catch(() => imageCache.delete(file.id));
    return () => {
      alive = false;
    };
  }, [file.id, store]);
  return <span className="sent-files__image">{url && <img src={url} alt={file.name} />}</span>;
}

export function SentFiles({ files }: { files: FileInfo[] }) {
  const { t } = useI18n();
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
            <SentImage key={file.id} file={file} />
          ))}
        </div>
      )}
      {documents.map((file) => (
        <FileCard key={file.id} name={file.name} meta={meta(file)} />
      ))}
    </div>
  );
}
