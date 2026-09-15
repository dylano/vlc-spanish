import { addDays, isOnOrBefore, type IsoDate } from "./dates.ts";
import type { Result } from "./grade.ts";
import type { Direction, Progress } from "./schema.ts";

/**
 * SM-2 spaced repetition, one card per entry per direction.
 *
 * Kept behind the `Scheduler` interface so FSRS (`ts-fsrs`) can replace it later
 * without touching callers — see the plan's phase 3.
 */

export const EASE_START = 2.5;
export const EASE_FLOOR = 1.3;
export const EASE_CEILING = 3.0;

/** Interval ladder for the first two successful reps, in days. */
export const FIRST_INTERVAL = 1;
export const SECOND_INTERVAL = 3;

/** Multiplier applied to the previous interval on a "hard" answer. */
const HARD_MULTIPLIER_FLOOR = 1.2;

/**
 * Ceiling on the interval, in days. Without one the interval compounds past any
 * useful horizon (and past the four-digit years the ISO date helpers accept); a
 * year also matches the intent that vocabulary resurfaces periodically forever.
 */
export const MAX_INTERVAL = 365;

const EASE_DELTA: Record<Result, number> = {
  correct: 0.1,
  hard: -0.15,
  wrong: -0.2,
};

function clampEase(ease: number): number {
  return Math.min(EASE_CEILING, Math.max(EASE_FLOOR, Number(ease.toFixed(4))));
}

export interface Scheduler {
  /** A brand new card: due immediately. */
  create(userId: string, entryId: string, direction: Direction, today: IsoDate): Progress;
  /** Advance a card after an answer. */
  next(progress: Progress, result: Result, today: IsoDate): Progress;
}

export const sm2: Scheduler = {
  create(userId, entryId, direction, today) {
    return {
      userId,
      entryId,
      direction,
      due: today,
      interval: 0,
      ease: EASE_START,
      reps: 0,
      lapses: 0,
    };
  },

  next(progress, result, today) {
    const ease = clampEase(progress.ease + EASE_DELTA[result]);

    if (result === "wrong") {
      return {
        ...progress,
        ease,
        reps: 0,
        lapses: progress.lapses + 1,
        interval: FIRST_INTERVAL,
        due: addDays(today, FIRST_INTERVAL),
        lastResult: result,
        lastSeen: today,
      };
    }

    const reps = progress.reps + 1;
    let interval: number;
    if (reps === 1) {
      interval = FIRST_INTERVAL;
    } else if (reps === 2) {
      interval = SECOND_INTERVAL;
    } else {
      const multiplier = result === "correct" ? ease : Math.max(HARD_MULTIPLIER_FLOOR, ease - 0.6);
      interval = Math.min(MAX_INTERVAL, Math.max(1, Math.round(progress.interval * multiplier)));
    }

    return {
      ...progress,
      ease,
      reps,
      interval,
      due: addDays(today, interval),
      lastResult: result,
      lastSeen: today,
    };
  },
};

/** Convenience binding to the default scheduler. */
export function schedule(progress: Progress, result: Result, today: IsoDate): Progress {
  return sm2.next(progress, result, today);
}

export function isDue(progress: Progress, today: IsoDate): boolean {
  return isOnOrBefore(progress.due, today);
}
