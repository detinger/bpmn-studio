/** Time helpers. The simulation clock unit is the minute. */

export type DisplayUnit = 'seconds' | 'minutes' | 'hours' | 'days';

export const UNIT_FACTORS: Record<DisplayUnit, number> = {
  seconds: 1 / 60,
  minutes: 1,
  hours: 60,
  days: 1440
};

export const UNIT_SHORT: Record<DisplayUnit, string> = {
  seconds: 's',
  minutes: 'min',
  hours: 'h',
  days: 'd'
};

/**
 * Parse an ISO-8601 duration (e.g. `PT2H30M`, `P1D`, `PT45S`) into minutes.
 * Returns null for dates, cycles or unparsable expressions.
 */
export function parseIsoDurationMinutes(expr: string | undefined): number | null {
  if (!expr) return null;
  const m = /^P(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(expr.trim());
  if (!m || expr.trim().toUpperCase() === 'P' || expr.trim().toUpperCase() === 'PT') return null;
  const [, w, d, h, min, s] = m;
  const n = (x?: string) => (x ? Number.parseFloat(x) : 0);
  return n(w) * 7 * 1440 + n(d) * 1440 + n(h) * 60 + n(min) + n(s) / 60;
}

/** Human readable duration from minutes, choosing a suitable unit. */
export function formatDuration(minutes: number, digits = 1): string {
  if (!Number.isFinite(minutes)) return '—';
  const abs = Math.abs(minutes);
  if (abs < 1) return `${(minutes * 60).toFixed(digits === 0 ? 0 : 0)} s`;
  if (abs < 120) return `${round(minutes, digits)} min`;
  if (abs < 2880) return `${round(minutes / 60, digits)} h`;
  return `${round(minutes / 1440, digits)} d`;
}

export function round(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  const f = 10 ** digits;
  const r = Math.round(n * f) / f;
  return r.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function formatPercent(fraction: number | null | undefined, digits = 1): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '—';
  return `${round(fraction * 100, digits)}%`;
}

export function formatMoney(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: digits, maximumFractionDigits: digits });
}
