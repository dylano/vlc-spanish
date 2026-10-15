import { describe, expect, it } from "vite-plus/test";
import { CHECK_EVERY_MS, dueForCheck, newerBuild } from "./update.ts";

describe("checking for a newer build", () => {
  const now = 1_800_000_000_000;

  it("asks the first time, then not again for six hours", () => {
    expect(dueForCheck(undefined, now)).toBe(true);
    expect(dueForCheck(now - 60_000, now)).toBe(false);
    expect(dueForCheck(now - CHECK_EVERY_MS + 1, now)).toBe(false);
    expect(dueForCheck(now - CHECK_EVERY_MS, now)).toBe(true);
    expect(CHECK_EVERY_MS).toBe(6 * 60 * 60 * 1000);
  });

  it("asks if the clock has gone backwards, rather than never", () => {
    expect(dueForCheck(now + 60_000, now)).toBe(true);
  });

  it("calls a different live commit newer, and anything doubtful not", () => {
    expect(newerBuild({ commit: "b2c3d4e" }, "a1b2c3d")).toBe(true);
    expect(newerBuild({ commit: "a1b2c3d" }, "a1b2c3d")).toBe(false);
    expect(newerBuild({ commit: "unknown" }, "a1b2c3d")).toBe(false);
    expect(newerBuild({ commit: "b2c3d4e" }, "unknown")).toBe(false);
    expect(newerBuild({}, "a1b2c3d")).toBe(false);
    expect(newerBuild("<html>", "a1b2c3d")).toBe(false);
    expect(newerBuild(null, "a1b2c3d")).toBe(false);
  });
});
