import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type {
  ConflictBlock,
  ConflictChoice,
  ConflictFile,
  GitInfo,
  Workspace,
} from "@xiaoban/protocol";
import { useEffect, useState } from "react";
import { useHub } from "../../app/hub.tsx";
import { openInEditor } from "./editor.ts";
import { highlightLine } from "./highlight.ts";

function Side({
  label,
  lines,
  path,
  tone,
}: {
  label: string;
  lines: string[];
  path: string;
  tone: "ours" | "theirs";
}) {
  return (
    <div className="conflict-side" data-tone={tone}>
      <div className="conflict-side__label">{label}</div>
      {lines.map((line, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: conflict lines have no identity
          key={index}
          className="conflict-side__line"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: highlight.js escapes the source text
          dangerouslySetInnerHTML={{ __html: highlightLine(line, path) || " " }}
        />
      ))}
    </div>
  );
}

function Block({
  file,
  block,
  number,
  total,
  branch,
  busy,
  onResolve,
  onAsk,
  onEditor,
}: {
  file: ConflictFile;
  block: ConflictBlock;
  number: number;
  total: number;
  branch: string;
  busy: boolean;
  onResolve: (choice: ConflictChoice) => void;
  onAsk: () => void;
  onEditor: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="conflict-block">
      <div className="conflict-block__head">
        <b>{t("conflict-number", { number, total })}</b>
        <span className="conflict-block__where">
          {t("conflict-where", { path: file.path, line: block.line })}
        </span>
      </div>
      <div className="conflict-block__sides">
        <Side
          label={t("conflict-ours", { branch })}
          lines={block.ours}
          path={file.path}
          tone="ours"
        />
        <Side
          label={t("conflict-theirs", { branch: block.theirsLabel || t("conflict-incoming") })}
          lines={block.theirs}
          path={file.path}
          tone="theirs"
        />
      </div>
      <div className="conflict-block__actions">
        <button type="button" disabled={busy} onClick={() => onResolve("ours")}>
          {t("conflict-use-ours")}
        </button>
        <button type="button" disabled={busy} onClick={() => onResolve("theirs")}>
          {t("conflict-use-theirs")}
        </button>
        <button type="button" disabled={busy} onClick={() => onResolve("both")}>
          {t("conflict-use-both")}
        </button>
        <button type="button" data-primary disabled={busy} onClick={onAsk}>
          {t("conflict-ask")}
        </button>
        <button type="button" className="code-link" onClick={onEditor}>
          {t("conflict-editor")}
        </button>
      </div>
    </section>
  );
}

export function ConflictView({
  workspace,
  git,
  onAsk,
}: {
  workspace: Workspace;
  git: GitInfo;
  onAsk: (text: string) => void;
}) {
  const { t } = useI18n();
  const store = useHub();
  const { filesVersion } = useHubState(store);
  const version = filesVersion[workspace.id] ?? 0;
  const [files, setFiles] = useState<ConflictFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void version;
    store
      .conflicts(workspace.id)
      .then((list) => live && setFiles(list))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [store, workspace.id, version]);

  const total = files.reduce((sum, file) => sum + file.blocks.length, 0);
  const incoming = files[0]?.blocks[0]?.theirsLabel || t("conflict-incoming");
  const branch = git.branch ?? "";
  let counter = 0;

  const resolve = (file: ConflictFile, block: ConflictBlock, choice: ConflictChoice) => {
    setBusy(true);
    setFailure(null);
    void store
      .resolveConflict(workspace.id, file.path, block.index, choice)
      .then(setFiles)
      .catch((error: unknown) => setFailure(error instanceof Error ? error.message : String(error)))
      .finally(() => setBusy(false));
  };

  return (
    <div className="conflicts">
      <div className="conflicts__banner">
        <b>{t("conflict-banner", { incoming, branch })}</b>
        <span>{t("conflict-count", { files: files.length, blocks: total })}</span>
      </div>
      {failure && <p className="commit-dialog__failure conflicts__failure">{failure}</p>}
      <div className="conflicts__list">
        {total === 0 && <p className="code-empty">{t("conflict-none-left")}</p>}
        {files.map((file) =>
          file.blocks.map((block) => {
            counter += 1;
            return (
              <Block
                key={`${file.path}-${block.index}`}
                file={file}
                block={block}
                number={counter}
                total={total}
                branch={branch}
                busy={busy}
                onResolve={(choice) => resolve(file, block, choice)}
                onAsk={() =>
                  onAsk(
                    t("conflict-ask-text", {
                      path: file.path,
                      line: block.line,
                      incoming: block.theirsLabel || incoming,
                    }),
                  )
                }
                onEditor={() =>
                  void openInEditor(store, workspace.id, `${workspace.path}/${file.path}`)
                }
              />
            );
          }),
        )}
      </div>
    </div>
  );
}
