import type { Draft } from "@xiaoban/client";

const OPERATE_TOOLS = new Set(["look_at_app", "click", "type_text", "press_keys", "confirm"]);

export const isOperating = (draft: Draft): boolean =>
  draft.tools.some((tool) => OPERATE_TOOLS.has(tool));
