import { describe, expect, it } from "vite-plus/test";
import { keycapLabel, shortcutFor } from "./shortcuts.ts";

const press = (key: string, extra: Partial<Parameters<typeof shortcutFor>[0]> = {}) =>
  shortcutFor({
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    repeat: false,
    isComposing: false,
    ...extra,
  });

describe("shortcutFor", () => {
  it("names Enter, Escape and letters, any case", () => {
    expect(press("Enter")).toBe("Enter");
    expect(press("Escape")).toBe("Escape");
    expect(press("g")).toBe("g");
    expect(press("G")).toBe("g");
  });

  it("leaves everything else alone", () => {
    expect(press("1")).toBeUndefined();
    expect(press("ñ")).toBeUndefined();
    expect(press("ArrowDown")).toBeUndefined();
    expect(press(" ")).toBeUndefined();
  });

  it("ignores modified, held and composing keys", () => {
    expect(press("c", { metaKey: true })).toBeUndefined();
    expect(press("c", { ctrlKey: true })).toBeUndefined();
    expect(press("c", { altKey: true })).toBeUndefined();
    expect(press("Enter", { repeat: true })).toBeUndefined();
    expect(press("Enter", { isComposing: true })).toBeUndefined();
  });
});

describe("keycapLabel", () => {
  it("draws Enter as ↵, Escape as Esc and letters in capitals", () => {
    expect(keycapLabel("Enter")).toBe("↵");
    expect(keycapLabel("Escape")).toBe("Esc");
    expect(keycapLabel("p")).toBe("P");
  });
});
