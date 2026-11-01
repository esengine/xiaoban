import { countChars, fileName, type HubStore, plainText } from "@xiaoban/client";
import { useHubState } from "@xiaoban/client/react";
import { useI18n } from "@xiaoban/i18n/react";
import type { ContextNote, Doc, DocBlock, DocSuggestion } from "@xiaoban/protocol";
import { color } from "@xiaoban/tokens";
import * as Clipboard from "expo-clipboard";
import * as Print from "expo-print";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { ChatBar, LifeHeader, life, Sheet, SheetAction } from "../life/LifeUI.tsx";
import { Working } from "../life/Working.tsx";
import { docHtml } from "./docHtml.ts";
import { keepFile, MIME, saveExport, useExporter } from "./exportFile.ts";
import { AskChip, rich, ShareButton } from "./WorkUI.tsx";

type Translate = ReturnType<typeof useI18n>["t"];

function selectedNote(
  t: Translate,
  block: DocBlock,
  selected: string,
  action: string,
): ContextNote {
  return {
    label: t("doc-selected-label"),
    body: t("doc-selected-body", { id: block.id, selected, paragraph: block.text, action }),
  };
}

function Suggestion({
  store,
  doc,
  item,
  onTurn,
}: {
  store: HubStore;
  doc: Doc;
  item: DocSuggestion;
  onTurn: (turnId: string) => void;
}) {
  const { t } = useI18n();
  const block = doc.blocks.find((candidate) => candidate.id === item.blockId);
  const another = () => {
    if (!doc.threadId) return;
    const note = block
      ? selectedNote(t, block, item.before, item.action)
      : {
          label: t("doc-selected-label"),
          body: t("doc-selected-body", {
            id: item.blockId,
            selected: item.before,
            paragraph: item.before,
            action: item.action,
          }),
        };
    void store
      .send(doc.threadId, t("doc-another"), { context: [note] })
      .then(onTurn)
      .catch(() => undefined);
  };
  return (
    <View style={styles.suggestion}>
      <Text style={styles.suggestionHead}>
        {t("doc-phone-suggestion", { action: item.action })}
      </Text>
      <Text style={styles.before}>{item.before.replaceAll("**", "")}</Text>
      <Text style={styles.after}>{item.after.replaceAll("**", "")}</Text>
      <View style={styles.suggestionActions}>
        <Pressable
          style={[styles.pill, styles.pillDark]}
          accessibilityRole="button"
          onPress={() => void store.resolveSuggestion(doc.id, item.id, true).catch(() => undefined)}
        >
          <Text style={styles.pillDarkText}>{t("doc-use")}</Text>
        </Pressable>
        <Pressable
          style={[styles.pill, styles.pillLine]}
          accessibilityRole="button"
          disabled={!doc.threadId}
          onPress={another}
        >
          <Text style={styles.pillText}>{t("doc-another-button")}</Text>
        </Pressable>
        <Pressable
          style={styles.pill}
          accessibilityRole="button"
          onPress={() =>
            void store.resolveSuggestion(doc.id, item.id, false).catch(() => undefined)
          }
        >
          <Text style={styles.pillSoftText}>{t("doc-keep-original")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function blockStyle(kind: DocBlock["kind"]) {
  if (kind === "h1") return styles.h1;
  if (kind === "h2") return styles.h2;
  if (kind === "h3") return styles.h3;
  return styles.p;
}

export function DocScreen({ store, docId }: { store: HubStore; docId: string }) {
  const { t } = useI18n();
  const { doc } = useHubState(store);
  const current = doc?.id === docId ? doc : null;
  const [picked, setPicked] = useState<string | null>(null);
  const [asking, setAsking] = useState<DocBlock | null>(null);
  const [turn, setTurn] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState(0);
  const [sharing, setSharing] = useState(false);
  const exporter = useExporter(() => setSharing(false));

  useEffect(() => {
    void store.openDoc(docId).catch(() => undefined);
  }, [store, docId]);

  if (!current) {
    return (
      <View style={styles.screen}>
        <LifeHeader title="" />
      </View>
    );
  }

  const threadId = current.threadId;
  const readOnly = current.writing || !threadId;
  const marked = new Set(current.marks.map((mark) => mark.blockId));
  const pending = current.marks.length + current.suggestions.length;
  const sub = current.writing
    ? t("doc-writing", {
        n: Math.min(current.written + 1, current.outline.length),
        total: current.outline.length,
      })
    : pending > 0
      ? t("doc-phone-pending", { count: pending })
      : t("doc-saved", { chars: countChars(current.blocks) });

  const act = (block: DocBlock, action: string) => {
    if (!threadId) return;
    void store
      .send(threadId, t("doc-ask-action", { action }), {
        context: [selectedNote(t, block, block.text, action)],
      })
      .then(setTurn)
      .catch(() => undefined);
    setPicked(null);
  };

  const askAbout = (question: string) => {
    if (!threadId || !asking) return Promise.resolve(null);
    const block = asking;
    setAsking(null);
    return store.send(threadId, t("doc-ask-question", { question }), {
      context: [selectedNote(t, block, block.text, t("doc-act-ask"))],
    });
  };

  const text = `${current.title}\n\n${plainText(current.blocks)}`;
  const placed = new Set<string>();
  let number = 0;

  return (
    <View style={styles.screen}>
      <LifeHeader
        title={current.title}
        sub={sub}
        right={
          <ShareButton
            label={t("doc-phone-share")}
            onPress={() => {
              exporter.clear();
              setSharing(true);
            }}
          />
        }
      />
      <View style={styles.rule} />
      <ScrollView
        style={life.scroll}
        contentContainerStyle={styles.article}
        keyboardShouldPersistTaps="handled"
      >
        {current.marks.length >= 2 ? (
          <View style={styles.marks}>
            <Text style={styles.marksText}>
              {t("doc-marks-count", { count: current.marks.length })}
            </Text>
            <View style={styles.marksActions}>
              <Pressable
                hitSlop={6}
                accessibilityRole="button"
                onPress={() => void store.resolveAllMarks(current.id, true).catch(() => undefined)}
              >
                <Text style={life.link}>{t("doc-marks-keep-all")}</Text>
              </Pressable>
              <Pressable
                hitSlop={6}
                accessibilityRole="button"
                onPress={() => void store.resolveAllMarks(current.id, false).catch(() => undefined)}
              >
                <Text style={[life.link, { color: color.dangerInk }]}>
                  {t("doc-marks-undo-all")}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        {current.blocks.map((block, index) => {
          number = block.kind === "number" ? number + 1 : 0;
          const isMarked = marked.has(block.id);
          const isPicked = picked === block.id || asking?.id === block.id;
          const suggestions = current.suggestions.filter((item) => item.blockId === block.id);
          for (const item of suggestions) placed.add(item.id);
          const body = (
            <Text style={[blockStyle(block.kind), styles.flex]}>
              {rich(block.text, styles.bold)}
            </Text>
          );
          return (
            <View key={block.id} style={isPicked ? styles.raised : null}>
              {picked === block.id ? (
                <View style={styles.toolbar} accessibilityRole="toolbar">
                  {[t("doc-act-plain"), t("doc-act-shorter"), t("doc-act-example")].map(
                    (action) => (
                      <Pressable
                        key={action}
                        style={styles.tool}
                        accessibilityRole="button"
                        onPress={() => act(block, action)}
                      >
                        <Text style={styles.toolText}>{action}</Text>
                      </Pressable>
                    ),
                  )}
                  <Pressable
                    style={[styles.tool, styles.toolAsk]}
                    accessibilityRole="button"
                    onPress={() => {
                      setAsking(block);
                      setPicked(null);
                      setFocusKey((value) => value + 1);
                    }}
                  >
                    <Text style={styles.toolText}>{t("doc-act-ask")}</Text>
                  </Pressable>
                </View>
              ) : null}
              <Pressable
                disabled={readOnly || block.kind === "h1"}
                accessibilityRole="button"
                onPress={() => setPicked(picked === block.id ? null : block.id)}
                style={[styles.block, isMarked && styles.marked, isPicked && styles.picked]}
              >
                {block.kind === "bullet" ? <View style={styles.dot} /> : null}
                {block.kind === "number" ? (
                  <Text style={[styles.p, styles.number]}>{`${number}.`}</Text>
                ) : null}
                {body}
              </Pressable>
              {index === 0 && block.kind === "h1" && current.subtitle ? (
                <Text style={styles.subtitle}>{current.subtitle}</Text>
              ) : null}
              {isMarked && !readOnly ? (
                <View style={styles.markActions}>
                  <Pressable
                    hitSlop={6}
                    accessibilityRole="button"
                    onPress={() =>
                      void store.resolveMark(current.id, block.id, true).catch(() => undefined)
                    }
                  >
                    <Text style={life.link}>{t("doc-mark-keep")}</Text>
                  </Pressable>
                  <Pressable
                    hitSlop={6}
                    accessibilityRole="button"
                    onPress={() =>
                      void store.resolveMark(current.id, block.id, false).catch(() => undefined)
                    }
                  >
                    <Text style={[life.link, { color: color.dangerInk }]}>
                      {t("doc-mark-undo")}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
              {suggestions.map((item) => (
                <Suggestion
                  key={item.id}
                  store={store}
                  doc={current}
                  item={item}
                  onTurn={setTurn}
                />
              ))}
            </View>
          );
        })}
        {current.suggestions
          .filter((item) => !placed.has(item.id))
          .map((item) => (
            <Suggestion key={item.id} store={store} doc={current} item={item} onTurn={setTurn} />
          ))}
        {current.writing ? (
          <>
            {current.outline.slice(current.written).map((title) => (
              <View key={title} style={styles.pending}>
                <Text style={[styles.h2, styles.pendingTitle]}>{title}</Text>
                <View style={styles.shimmer} />
                <View style={[styles.shimmer, styles.shimmerShort]} />
              </View>
            ))}
            <Working
              text={t("doc-writing", {
                n: Math.min(current.written + 1, current.outline.length),
                total: current.outline.length,
              })}
            />
          </>
        ) : null}
      </ScrollView>
      <ChatBar
        store={store}
        threadId={threadId}
        placeholder={asking ? t("doc-act-ask-placeholder") : t("doc-chat-placeholder")}
        top={
          asking ? (
            <AskChip
              text={t("doc-phone-asking", { text: asking.text.replaceAll("**", "") })}
              closeLabel={t("dialog-close")}
              onClose={() => setAsking(null)}
            />
          ) : null
        }
        onSend={asking ? askAbout : undefined}
        turn={turn}
        onTurn={setTurn}
        focusKey={focusKey}
      />
      <Sheet open={sharing} onClose={() => setSharing(false)}>
        <Text style={life.sheetTitle}>{current.title}</Text>
        <SheetAction
          label={exporter.busy === "docx" ? t("export-phone-busy") : t("doc-export-word")}
          disabled={current.writing || exporter.busy !== null}
          onPress={() =>
            exporter.start("docx", async () =>
              saveExport(await store.exportDocData(current.id, "docx")),
            )
          }
        />
        <SheetAction
          label={exporter.busy === "pdf" ? t("export-phone-busy") : t("doc-export-pdf")}
          disabled={current.writing || exporter.busy !== null}
          onPress={() =>
            exporter.start("pdf", async () => {
              const { uri } = await Print.printToFileAsync({ html: docHtml(current) });
              return keepFile(uri, fileName(current.title, "pdf"), MIME.pdf);
            })
          }
        />
        <SheetAction
          label={t("doc-phone-send")}
          disabled={current.writing}
          onPress={() => {
            setSharing(false);
            void Share.share({ title: current.title, message: text }).catch(() => undefined);
          }}
        />
        <SheetAction
          label={t("doc-format-copy")}
          disabled={current.writing}
          onPress={() => {
            setSharing(false);
            void Clipboard.setStringAsync(text).catch(() => undefined);
          }}
        />
        {exporter.failed ? (
          <Text style={[life.hint, styles.failed]}>{t("export-phone-failed")}</Text>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  failed: { color: color.dangerInk },
  rule: { height: 1, backgroundColor: color.lineSoft },
  article: { paddingHorizontal: 22, paddingTop: 20, paddingBottom: 28, gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  raised: { zIndex: 2 },
  block: { flexDirection: "row", gap: 8, borderRadius: 4 },
  marked: {
    backgroundColor: color.diffAdded,
    borderBottomWidth: 2,
    borderBottomColor: color.diffAddedBar,
    paddingHorizontal: 4,
    marginHorizontal: -4,
  },
  picked: { backgroundColor: color.codePick, paddingHorizontal: 3, marginHorizontal: -3 },
  h1: { fontSize: 24, lineHeight: 34, fontWeight: "600", color: color.ink },
  h2: { fontSize: 16, lineHeight: 26, fontWeight: "700", color: color.ink, marginTop: 4 },
  h3: { fontSize: 15, lineHeight: 24, fontWeight: "700", color: color.ink },
  p: { fontSize: 15, lineHeight: 28, color: color.inkSoft },
  bold: { fontWeight: "700", color: color.ink },
  subtitle: { fontSize: 13, color: color.muted, marginTop: 4 },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.inkSoft,
    marginTop: 12,
    marginLeft: 4,
  },
  number: { minWidth: 18 },
  markActions: { flexDirection: "row", gap: 16, marginTop: 6 },
  marks: {
    backgroundColor: color.diffAdded,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  marksText: { fontSize: 13, color: color.success },
  marksActions: { flexDirection: "row", gap: 16 },
  toolbar: {
    position: "absolute",
    left: 0,
    bottom: "100%",
    marginBottom: 8,
    flexDirection: "row",
    gap: 2,
    backgroundColor: color.ink,
    borderRadius: 12,
    padding: 4,
  },
  tool: { height: 34, paddingHorizontal: 10, justifyContent: "center", borderRadius: 9 },
  toolAsk: { backgroundColor: color.accent },
  toolText: { fontSize: 13, color: color.surface },
  suggestion: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  suggestionHead: { fontSize: 12, color: color.muted },
  before: {
    fontSize: 14,
    lineHeight: 24,
    color: color.dangerInk,
    textDecorationLine: "line-through",
  },
  after: {
    fontSize: 14,
    lineHeight: 24,
    color: color.success,
    backgroundColor: color.successSoft,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    overflow: "hidden",
  },
  suggestionActions: { flexDirection: "row", gap: 8 },
  pill: { height: 36, paddingHorizontal: 14, borderRadius: 10, justifyContent: "center" },
  pillDark: { backgroundColor: color.ink },
  pillLine: { borderWidth: 1, borderColor: color.lineStrong },
  pillDarkText: { fontSize: 13, color: color.surface },
  pillText: { fontSize: 13, color: color.ink },
  pillSoftText: { fontSize: 13, color: color.inkMid },
  pending: { gap: 8 },
  pendingTitle: { color: color.faint },
  shimmer: { height: 12, borderRadius: 6, backgroundColor: color.lineSoft },
  shimmerShort: { width: "60%" },
});
