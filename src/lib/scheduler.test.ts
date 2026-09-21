import { describe, expect, it } from "vite-plus/test";
import { addDays, daysBetween, toIsoDate } from "./dates.ts";
import {
  EASE_FLOOR,
  EASE_START,
  forgiveMisses,
  isDue,
  MAX_INTERVAL,
  RECOGNITION_MAX_INTERVAL,
  schedule,
  sm2,
} from "./scheduler.ts";
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

describe("recognition answers", () => {
  /** Answer correctly by recognition `n` times, advancing the clock each time. */
  function recognize(card: Progress, n: number): Progress {
    let current = card;
    for (let i = 0; i < n; i++) current = schedule(current, "correct", current.due, "recognition");
    return current;
  }

  it("follows the same early ladder as recall", () => {
    const card = recognize(newCard(), 2);
    expect(card.reps).toBe(2);
    expect(card.interval).toBe(3);
  });

  it("never schedules a word further out than the recognition limit", () => {
    const card = recognize(newCard(), 12);
    expect(card.interval).toBe(RECOGNITION_MAX_INTERVAL);
    expect(daysBetween(card.lastSeen!, card.due)).toBe(RECOGNITION_MAX_INTERVAL);
  });

  it("does not raise ease", () => {
    expect(recognize(newCard(), 5).ease).toBe(EASE_START);
  });

  it("does not shorten an interval already earned by recall", () => {
    const recalled = drill(newCard(), ["correct", "correct", "correct", "correct"]);
    expect(recalled.interval).toBeGreaterThan(RECOGNITION_MAX_INTERVAL);
    const after = schedule(recalled, "correct", recalled.due, "recognition");
    expect(after.interval).toBe(recalled.interval);
  });

  it("lets recall carry a word past the limit afterwards", () => {
    const card = recognize(newCard(), 6);
    const recalled = schedule(card, "correct", card.due);
    expect(recalled.interval).toBeGreaterThan(RECOGNITION_MAX_INTERVAL);
  });

  it("lapses a wrong recognition answer like any other", () => {
    const card = recognize(newCard(), 4);
    const missed = schedule(card, "wrong", card.due, "recognition");
    expect(missed.interval).toBe(1);
    expect(missed.lapses).toBe(1);
    expect(missed.ease).toBeLessThan(card.ease);
  });

  it("defaults to recall", () => {
    const card = drill(newCard(), ["correct", "correct"]);
    expect(schedule(card, "correct", card.due)).toEqual(
      schedule(card, "correct", card.due, "recall"),
    );
  });
});

describe("answers before the due date", () => {
  it("leaves the schedule alone on a right answer", () => {
    const card = schedule(newCard(), "correct", TODAY);
    const early = schedule(card, "correct", TODAY);
    expect(early).toEqual({ ...card, lastResult: "correct", lastSeen: TODAY });
  });

  it("still counts a miss", () => {
    const card = drill(newCard(), ["correct", "correct"]);
    const missed = schedule(card, "wrong", TODAY);
    expect(missed.lapses).toBe(1);
    expect(missed.due).toBe(addDays(TODAY, 1));
  });
});

describe("forgiving misses", () => {
  it("clears the count and turns a recent miss into a right answer, giving back its ease", () => {
    const card = drill(newCard(), ["correct", "correct"]);
    const missed = schedule(card, "wrong", card.due);
    const forgiven = forgiveMisses(missed);
    expect(forgiven.lapses).toBe(0);
    expect(forgiven.lastResult).toBe("correct");
    expect(forgiven.ease).toBeCloseTo(card.ease);
    expect(forgiven.due).toBe(missed.due);
  });

  it("only clears the count when the last answer was already right", () => {
    const card = { ...drill(newCard(), ["correct"]), lapses: 3 };
    expect(forgiveMisses(card)).toEqual({ ...card, lapses: 0 });
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
