import { describe, expect, it } from "vitest";
import { providerSvgDataUri, providerSvgs } from "../src/index.ts";

describe("provider icons", () => {
  it("ships a clean svg for every provider", () => {
    for (const svg of Object.values(providerSvgs)) {
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg).not.toMatch(/<(title|script|style)/);
    }
  });

  it("encodes a data uri", () => {
    expect(providerSvgDataUri("deepseek")).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
  });
});
