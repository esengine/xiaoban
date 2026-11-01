import { describe, expect, it } from "vitest";
import { activeModelName, modelName } from "./modelName.ts";

describe("modelName", () => {
  it("turns model ids into readable names", () => {
    expect(modelName("deepseek-v4-flash")).toBe("DeepSeek V4 Flash");
    expect(modelName("deepseek-v4-pro")).toBe("DeepSeek V4 Pro");
    expect(modelName("mimo-v2.5-pro")).toBe("MiMo V2.5 Pro");
  });

  it("prefers the user's own label", () => {
    expect(
      activeModelName({ provider: "custom", model: "x-1", label: "My relay", baseUrl: null }),
    ).toBe("My relay");
  });
});
