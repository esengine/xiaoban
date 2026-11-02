import { requireOptionalNativeModule } from "expo";

interface Subscription {
  remove(): void;
}

interface XiaobanHubNative {
  start(locale: string, secrets: string, name: string): Promise<number>;
  stop(): Promise<void>;
  setStrings(strings: string): void;
  island(state: string): void;
  planBall?(state: string): void;
  turnDone(title: string): boolean;
  operatorReady(): boolean;
  openOperatorSettings(detailHint: string, listHint: string): void;
  openRecognizerSettings(hint: string): void;
  notify(request: string): string;
  withdrawNotice(id: string): void;
  setForeground(active: boolean): void;
  backgroundStatus?(): {
    notifications: boolean;
    battery: boolean;
    exactAlarms: boolean;
    xiaomi: boolean;
  };
  openBackgroundSetting?(kind: string): boolean;
  takeShare?(): Promise<string | null>;
  closeShare?(): void;
  openFromShare?(url: string): void;
  addListener(event: "onNoticeAnswer", listener: (event: { answer: string }) => void): Subscription;
  addListener(event: "onPlanBall", listener: (event: { action: string }) => void): Subscription;
  addListener(event: "onShare", listener: () => void): Subscription;
}

export const XiaobanHub = requireOptionalNativeModule<XiaobanHubNative>("XiaobanHub");
