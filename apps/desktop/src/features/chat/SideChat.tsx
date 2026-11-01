import { useHubState } from "@xiaoban/client/react";
import { type ReactNode, useEffect } from "react";
import { useHub } from "../../app/hub.tsx";
import { ChatPane, type SideLabels } from "./ChatPane.tsx";

export type { SideLabels };

export function SideChat({
  threadId,
  labels,
  extra,
}: {
  threadId: string;
  labels: SideLabels;
  extra?: ReactNode;
}) {
  const store = useHub();
  const { status } = useHubState(store);
  useEffect(() => {
    if (status === "open") void store.loadMessages(threadId).catch(() => undefined);
  }, [store, threadId, status]);
  return <ChatPane key={threadId} threadId={threadId} primary={false} side={{ labels, extra }} />;
}
