import { requireOptionalNativeModule } from "expo";

interface XiaobanHubNative {
  start(locale: string, secrets: string, name: string): Promise<number>;
  stop(): Promise<void>;
}

export const XiaobanHub = requireOptionalNativeModule<XiaobanHubNative>("XiaobanHub");
