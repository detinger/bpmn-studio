/**
 * Weekly availability calendars for resource pools.
 *
 * Simulation time 0 corresponds to Monday 00:00 plus `calendarOffset`
 * minutes (configurable in the simulation settings). A pool without a
 * calendar is always available.
 */

export interface Shift {
  /** Days of week: 0 = Monday … 6 = Sunday. */
  days: number[];
  /** Start of shift in minutes after midnight. */
  start: number;
  /** End of shift in minutes after midnight (exclusive). May not cross midnight. */
  end: number;
}

export interface WeeklyCalendar {
  kind: 'weekly';
  shifts: Shift[];
}

export const WEEK = 7 * 24 * 60;
const DAY = 24 * 60;

/** Merged availability intervals within one week, in minutes since Monday 00:00. */
export function weeklyIntervals(cal: WeeklyCalendar): Array<[number, number]> {
  const raw: Array<[number, number]> = [];
  for (const s of cal.shifts) {
    const start = Math.max(0, Math.min(DAY, s.start));
    const end = Math.max(0, Math.min(DAY, s.end));
    if (end <= start) continue;
    for (const d of s.days) {
      if (d < 0 || d > 6) continue;
      raw.push([d * DAY + start, d * DAY + end]);
    }
  }
  raw.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const iv of raw) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  return merged;
}

export class CalendarClock {
  private intervals: Array<[number, number]>;

  constructor(
    cal: WeeklyCalendar,
    private offset: number
  ) {
    this.intervals = weeklyIntervals(cal);
  }

  get alwaysClosed(): boolean {
    return this.intervals.length === 0;
  }

  isOpen(t: number): boolean {
    if (this.intervals.length === 0) return false;
    const w = mod(t + this.offset, WEEK);
    return this.intervals.some(([a, b]) => w >= a && w < b);
  }

  /** The next time strictly after `t` at which availability changes, or Infinity. */
  nextChange(t: number): number {
    if (this.intervals.length === 0) return Infinity;
    const abs = t + this.offset;
    const weekStart = Math.floor(abs / WEEK) * WEEK;
    for (let k = 0; k < 2; k++) {
      for (const [a, b] of this.intervals) {
        for (const edge of [a, b]) {
          const e = weekStart + k * WEEK + edge;
          if (e > abs + 1e-9) return e - this.offset;
        }
      }
    }
    return Infinity;
  }

  /** Total open minutes within [from, to). */
  openTimeBetween(from: number, to: number): number {
    if (to <= from || this.intervals.length === 0) return 0;
    let total = 0;
    const a0 = from + this.offset;
    const b0 = to + this.offset;
    const firstWeek = Math.floor(a0 / WEEK);
    const lastWeek = Math.floor(b0 / WEEK);
    for (let w = firstWeek; w <= lastWeek; w++) {
      for (const [a, b] of this.intervals) {
        const s = Math.max(a0, w * WEEK + a);
        const e = Math.min(b0, w * WEEK + b);
        if (e > s) total += e - s;
      }
    }
    return total;
  }
}

function mod(a: number, n: number) {
  return ((a % n) + n) % n;
}

export function formatClock(minutesOfDay: number): string {
  const h = Math.floor(minutesOfDay / 60);
  const m = Math.round(minutesOfDay % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseClock(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function officeHours(start = 8 * 60, end = 16 * 60): WeeklyCalendar {
  return { kind: 'weekly', shifts: [{ days: [0, 1, 2, 3, 4], start, end }] };
}
