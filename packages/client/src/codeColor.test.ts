import { describe, expect, it } from "vitest";
import { extensionOfName, tokenize } from "./codeColor.ts";

const kinds = (line: string, extension: string) =>
  tokenize(line, extension).map((token) => `${token.kind}:${token.text}`);

describe("tokenize", () => {
  it("leaves unknown files as they are", () => {
    expect(kinds("whatever <b> here", "txt")).toEqual(["plain:whatever <b> here"]);
  });

  it("colours scripts: words, strings, numbers and comments", () => {
    expect(kinds("const x = 'a' + 12; // note", "js")).toEqual([
      "keyword:const",
      "plain: x = ",
      "string:'a'",
      "plain: + ",
      "number:12",
      "plain:; ",
      "comment:// note",
    ]);
  });

  it("keeps a quote inside a string and a name that merely contains a keyword", () => {
    const tokens = tokenize(`let constant = "a \\" b";`, "ts");
    expect(tokens.map((token) => token.kind)).toEqual(["keyword", "plain", "string", "plain"]);
    expect(tokens[1]?.text).toBe(" constant = ");
  });

  it("colours tags and the quoted values inside them", () => {
    expect(kinds('<div class="wheel">hi</div>', "html")).toEqual([
      "tag:<div class=",
      'string:"wheel"',
      "tag:>",
      "plain:hi",
      "tag:</div>",
    ]);
    expect(kinds("<!-- a note --> text", "html")).toEqual([
      "comment:<!-- a note -->",
      "plain: text",
    ]);
  });

  it("colours style sheets: at-rules, numbers with units, comments", () => {
    expect(kinds("@media (width: 390px) { /* narrow */ }", "css")).toEqual([
      "keyword:@media",
      "plain: (width: ",
      "number:390px",
      "plain:) { ",
      "comment:/* narrow */",
      "plain: }",
    ]);
  });

  it("colours json, python hashes and markdown headings", () => {
    expect(kinds('{"a": true, "b": null}', "json")).toEqual([
      "plain:{",
      'string:"a"',
      "plain:: ",
      "keyword:true",
      "plain:, ",
      'string:"b"',
      "plain:: ",
      "keyword:null",
      "plain:}",
    ]);
    expect(kinds("x = 1  # one", "py").at(-1)).toBe("comment:# one");
    expect(kinds("## Title", "md")).toEqual(["keyword:## Title"]);
    expect(kinds("plain words", "md")).toEqual(["plain:plain words"]);
  });

  it("takes the extension from a file name", () => {
    expect(extensionOfName("Index.HTML")).toBe("html");
    expect(extensionOfName("Makefile")).toBe("");
    expect(extensionOfName("a.b.css")).toBe("css");
  });
});
