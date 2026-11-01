import type { Message } from "@xiaoban/protocol";
import type { ReactNode } from "react";
import { useRef } from "react";
import { type HostInstance, Pressable, View } from "react-native";
import { EventCard } from "../calendar/EventCard.tsx";
import { RecipeCard } from "../life/RecipeCard.tsx";
import { FailedCard } from "../schedule/ScheduleBits.tsx";
import { ScheduleCard } from "../schedule/ScheduleCard.tsx";
import { TripCard } from "../trip/TripCard.tsx";
import { DeckCard, DocCard, SheetCard } from "../work/WorkCards.tsx";
import { Bubble, bubbleStyles } from "./Bubble.tsx";
import { SearchCard } from "./SearchCard.tsx";
import { SentFiles } from "./SentFiles.tsx";
import { ReportTitle, SubthreadCards } from "./Subthreads.tsx";

function AttachmentCard({ message, last }: { message: Message; last: boolean }) {
  const attachment = message.attachment;
  switch (attachment?.kind) {
    case "trip":
      return <TripCard tripId={attachment.tripId} version={attachment.version} />;
    case "doc":
      return <DocCard docId={attachment.docId} />;
    case "sheet":
      return <SheetCard sheetId={attachment.sheetId} />;
    case "deck":
      return <DeckCard deckId={attachment.deckId} />;
    case "recipe":
      return <RecipeCard recipeId={attachment.recipeId} />;
    case "event":
      return <EventCard event={attachment.event} />;
    case "schedule":
      return <ScheduleCard scheduleId={attachment.scheduleId} />;
    case "schedule_failed":
      return <FailedCard scheduleId={attachment.scheduleId} reason={attachment.reason} />;
    case "subthreads":
      return <SubthreadCards threadIds={attachment.threadIds} />;
    case "service_needed":
      return attachment.service === "web_search" ? (
        <SearchCard threadId={message.threadId} answered={!last} />
      ) : null;
    default:
      return null;
  }
}

export function MessageItem({
  message,
  footer,
  last = false,
  onLongPress,
}: {
  message: Message;
  footer?: ReactNode;
  last?: boolean;
  onLongPress: (view: HostInstance | null) => void;
}) {
  const ref = useRef<HostInstance>(null);
  const report = message.attachment?.kind === "report" ? message.attachment : null;
  const user = message.role === "user" && !report;
  return (
    <View
      ref={ref}
      collapsable={false}
      style={user ? bubbleStyles.userShell : bubbleStyles.assistantShell}
    >
      {report ? <ReportTitle threadId={report.threadId} title={report.title} /> : null}
      <SentFiles files={message.files} align={user ? "flex-end" : "flex-start"} />
      {message.text ||
      message.quote ||
      (message.files.length === 0 && message.attachment?.kind !== "schedule_failed") ? (
        <Pressable delayLongPress={350} onLongPress={() => onLongPress(ref.current)}>
          <Bubble
            from={user ? "user" : "assistant"}
            text={message.text}
            quote={message.quote}
            footer={footer}
          />
        </Pressable>
      ) : (
        footer
      )}
      <AttachmentCard message={message} last={last} />
    </View>
  );
}
