import { requireOptionalNativeModule } from "expo";

interface Subscription {
  remove(): void;
}

interface XiaobanHubNative {
  start(locale: string, secrets: string, name: string): Promise<number>;
  stop(): Promise<void>;
  setStrings(strings: string): void;
  island(state: string): void;
  operatorReady(): boolean;
  openOperatorSettings(detailHint: string, listHint: string): void;
  notify(request: string): string;
  withdrawNotice(id: string): void;
  setForeground(active: boolean): void;
  addListener(event: "onNoticeAnswer", listener: (event: { answer: string }) => void): Subscription;
}

export const XiaobanHub = requireOptionalNativeModule<XiaobanHubNative>("XiaobanHub");
