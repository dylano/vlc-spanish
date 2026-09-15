/**
 * ISO calendar-date helpers ("YYYY-MM-DD"). Scheduling works in whole local days,
 * so everything here parses and formats explicitly rather than going through
 * Date's timezone-sensitive string handling.
 */

export type IsoDate = string;

export function toIsoDate(date: Date): IsoDate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function today(now: Date = new Date()): IsoDate {
  return toIsoDate(now);
}

function parse(date: IsoDate): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid ISO date: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const { y, m, d } = parse(date);
  return toIsoDate(new Date(y, m - 1, d + days));
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  const pa = parse(a);
  const pb = parse(b);
  const ua = Date.UTC(pa.y, pa.m - 1, pa.d);
  const ub = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((ub - ua) / 86_400_000);
}

export function isOnOrBefore(a: IsoDate, b: IsoDate): boolean {
  return a <= b;
}
