import { requireOptionalNativeModule } from "expo";

interface XiaobanHubNative {
  start(locale: string, secrets: string, name: string): Promise<number>;
  stop(): Promise<void>;
  setStrings(strings: string): void;
  island(state: string): void;
  operatorReady(): boolean;
  openOperatorSettings(): void;
}

export const XiaobanHub = requireOptionalNativeModule<XiaobanHubNative>("XiaobanHub");
