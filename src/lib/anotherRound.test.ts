import { describe, expect, it } from "vite-plus/test";
import { ANOTHER_ROUND, pickAnotherRound } from "./anotherRound.ts";

describe("the another-round button's phrase", () => {
  it("never repeats the phrase shown last time", () => {
    let previous: string | undefined;
    for (let i = 0; i < 500; i++) {
      const next = pickAnotherRound(previous).text;
      expect(next).not.toBe(previous);
      previous = next;
    }
  });

  it("can pick every phrase, the first time too", () => {
    const seen = new Set<string>();
    for (let i = 0; i < ANOTHER_ROUND.length; i++) {
      seen.add(pickAnotherRound(undefined, () => i / ANOTHER_ROUND.length).text);
    }
    expect(seen.size).toBe(ANOTHER_ROUND.length);
  });
});
