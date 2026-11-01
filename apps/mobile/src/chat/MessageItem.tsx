import type { Message } from "@xiaoban/protocol";
import type { ReactNode } from "react";
import { useRef } from "react";
import { type HostInstance, Pressable, View } from "react-native";
import { TripCard } from "../trip/TripCard.tsx";
import { Bubble, bubbleStyles } from "./Bubble.tsx";

export function MessageItem({
  message,
  footer,
  onLongPress,
}: {
  message: Message;
  footer?: ReactNode;
  onLongPress: (view: HostInstance | null) => void;
}) {
  const ref = useRef<HostInstance>(null);
  const user = message.role === "user";
  return (
    <View
      ref={ref}
      collapsable={false}
      style={user ? bubbleStyles.userShell : bubbleStyles.assistantShell}
    >
      <Pressable delayLongPress={350} onLongPress={() => onLongPress(ref.current)}>
        <Bubble from={message.role} text={message.text} quote={message.quote} footer={footer} />
      </Pressable>
      {message.attachment?.kind === "trip" ? (
        <TripCard tripId={message.attachment.tripId} version={message.attachment.version} />
      ) : null}
    </View>
  );
}
