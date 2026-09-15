import { describe, expect, it } from "vite-plus/test";
import { addDays, daysBetween, toIsoDate } from "./dates.ts";
import { EASE_FLOOR, EASE_START, isDue, MAX_INTERVAL, schedule, sm2 } from "./scheduler.ts";
import type { Progress } from "./schema.ts";

const TODAY = "2026-09-15";

function newCard(): Progress {
  return sm2.create("doliver", "abuelo", "en→es", TODAY);
}

/** Answer a card `n` times with the same result, advancing the clock each time. */
function drill(card: Progress, results: Parameters<typeof schedule>[1][]): Progress {
  let current = card;
  let day = TODAY;
  for (const result of results) {
    current = schedule(current, result, day);
    day = current.due;
  }
  return current;
}

describe("dates", () => {
  it("adds days across a month boundary", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("adds days across a year boundary", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles leap years", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("measures whole days between dates", () => {
    expect(daysBetween("2026-09-15", "2026-09-18")).toBe(3);
    expect(daysBetween("2026-09-18", "2026-09-15")).toBe(-3);
  });

  it("formats a Date in local time", () => {
    expect(toIsoDate(new Date(2026, 8, 15))).toBe("2026-09-15");
  });

  it("rejects malformed input", () => {
    expect(() => addDays("15/09/2026", 1)).toThrow();
  });
});

describe("new cards", () => {
  it("is due immediately", () => {
    const card = newCard();
    expect(card.due).toBe(TODAY);
    expect(isDue(card, TODAY)).toBe(true);
    expect(card.ease).toBe(EASE_START);
    expect(card.reps).toBe(0);
  });

  it("is not due before its due date", () => {
    const card = schedule(newCard(), "correct", TODAY);
    expect(isDue(card, TODAY)).toBe(false);
    expect(isDue(card, card.due)).toBe(true);
  });
});

describe("sm-2 progression", () => {
  it("walks the 1 → 3 → ease ladder on correct answers", () => {
    const first = schedule(newCard(), "correct", TODAY);
    expect(first.interval).toBe(1);
    expect(first.due).toBe("2026-09-16");

    const second = schedule(first, "correct", first.due);
    expect(second.interval).toBe(3);
    expect(second.due).toBe("2026-09-19");

    const third = schedule(second, "correct", second.due);
    // 3 days * ease (2.5 + two 0.1 bumps = 2.7) = 8.1 → 8
    expect(third.interval).toBe(8);
    expect(third.reps).toBe(3);
  });

  it("raises ease on correct answers and caps it", () => {
    const card = drill(
      newCard(),
      Array.from({ length: 20 }, () => "correct" as const),
    );
    expect(card.ease).toBeLessThanOrEqual(3.0);
    expect(card.ease).toBeGreaterThan(EASE_START);
  });

  it("caps the interval so a long streak stays on the calendar", () => {
    const card = drill(
      newCard(),
      Array.from({ length: 20 }, () => "correct" as const),
    );
    expect(card.interval).toBe(MAX_INTERVAL);
  });

  it("grows intervals monotonically while answers stay correct", () => {
    let card = newCard();
    let previous = 0;
    let day = TODAY;
    for (let i = 0; i < 6; i++) {
      card = schedule(card, "correct", day);
      day = card.due;
      expect(card.interval).toBeGreaterThanOrEqual(previous);
      previous = card.interval;
    }
  });
});

describe("hard answers", () => {
  it("advances the card but lowers ease", () => {
    const first = schedule(newCard(), "hard", TODAY);
    expect(first.reps).toBe(1);
    expect(first.ease).toBeLessThan(EASE_START);
    expect(first.interval).toBe(1);
  });

  it("grows the interval more slowly than a correct answer", () => {
    const base = drill(newCard(), ["correct", "correct"]);
    const easy = schedule(base, "correct", base.due);
    const hard = schedule(base, "hard", base.due);
    expect(hard.interval).toBeLessThan(easy.interval);
    expect(hard.interval).toBeGreaterThan(base.interval);
  });

  it("does not count as a lapse", () => {
    const card = drill(newCard(), ["correct", "hard"]);
    expect(card.lapses).toBe(0);
  });
});

describe("wrong answers", () => {
  it("lapses the card and schedules it for tomorrow", () => {
    const mature = drill(newCard(), ["correct", "correct", "correct"]);
    const lapsed = schedule(mature, "wrong", mature.due);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.reps).toBe(0);
    expect(lapsed.interval).toBe(1);
    expect(daysBetween(mature.due, lapsed.due)).toBe(1);
  });

  it("lowers ease but never below the floor", () => {
    const card = drill(
      newCard(),
      Array.from({ length: 20 }, () => "wrong" as const),
    );
    expect(card.ease).toBe(EASE_FLOOR);
  });

  it("records the last result and when it was seen", () => {
    const card = schedule(newCard(), "wrong", TODAY);
    expect(card.lastResult).toBe("wrong");
    expect(card.lastSeen).toBe(TODAY);
  });
});

describe("card identity", () => {
  it("keeps the card's identity fields across scheduling", () => {
    const card = schedule(newCard(), "correct", TODAY);
    expect(card.userId).toBe("doliver");
    expect(card.entryId).toBe("abuelo");
    expect(card.direction).toBe("en→es");
  });

  it("tracks directions as separate cards", () => {
    const forward = sm2.create("doliver", "abuelo", "en→es", TODAY);
    const back = sm2.create("doliver", "abuelo", "es→en", TODAY);
    const advanced = schedule(forward, "correct", TODAY);
    expect(advanced.due).not.toBe(back.due);
  });
});
