import { describe, expect, it } from "vite-plus/test";
import { entries } from "./dictionary.ts";

// The shipped file is parsed when the module loads, so importing it at all is
// the schema check; these cover what the schema cannot.
describe("bundled dictionary", () => {
  it("parses and is not empty", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("has no duplicate ids", () => {
    const ids = entries.map((entry) => entry.id);
    expect(ids.length).toBe(new Set(ids).size);
  });
});
