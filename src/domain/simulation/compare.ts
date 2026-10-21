/**
 * AS-IS vs TO-BE comparison of two simulation runs.
 *
 * When both runs use the same seed and number of replications, replication r
 * of both alternatives shares its random inputs (common random numbers), so
 * the per-replication differences are paired and a paired-t confidence
 * interval of the mean difference is valid. Otherwise (independent runs) the
 * difference CI uses Welch's approximation.
 */
import type { SimulationRun } from './experiment';
import type { ReplicationResult } from './engine';
import { estimate, tQuantile975 } from './stats';
import { experimentConditionDifferences } from './config';

export type Direction = 'lower' | 'higher';

export interface MetricComparison {
  id: string;
  label: string;
  unit: 'duration' | 'rate' | 'count' | 'percent' | 'money';
  better: Direction;
  asIs: number;
  toBe: number;
  asIsCi: number;
  toBeCi: number;
  /** toBe − asIs */
  difference: number;
  differenceCi: number;
  /** Relative improvement in the "better" direction (positive = improvement). */
  improvement: number;
  significant: boolean | null;
  method: 'paired' | 'welch' | 'none';
}

export interface ComparisonResult {
  metrics: MetricComparison[];
  paired: boolean;
  conditionDifferences: string[];
  bottleneck: { asIs?: { id: string; name: string; waiting: number }; toBe?: { id: string; name: string; waiting: number }; moved: boolean };
  maxUtilization: { asIs?: { name: string; value: number }; toBe?: { name: string; value: number } };
}

type Extract = (r: ReplicationResult, run: SimulationRun) => number | null;

const METRICS: Array<{ id: string; label: string; unit: MetricComparison['unit']; better: Direction; get: Extract }> = [
  { id: 'cycleTime', label: 'Average cycle time', unit: 'duration', better: 'lower', get: (r) => r.kpis.cycleTime.mean },
  { id: 'cycleTimeP90', label: '90th percentile cycle time', unit: 'duration', better: 'lower', get: (r) => r.kpis.cycleTime.p90 },
  { id: 'waitingTime', label: 'Average waiting time', unit: 'duration', better: 'lower', get: (r) => r.kpis.waitingTime.mean },
  { id: 'processingTime', label: 'Average processing time', unit: 'duration', better: 'lower', get: (r) => r.kpis.processingTime.mean },
  { id: 'throughput', label: 'Throughput (cases/h)', unit: 'rate', better: 'higher', get: (r) => r.kpis.throughputPerHour },
  { id: 'wip', label: 'Work in progress', unit: 'count', better: 'lower', get: (r) => r.kpis.wipAvg },
  { id: 'cost', label: 'Process cost per case', unit: 'money', better: 'lower', get: (r) => r.kpis.costPerCase.mean },
  { id: 'sla', label: 'SLA compliance', unit: 'percent', better: 'higher', get: (r) => r.kpis.slaCompliance },
  {
    id: 'utilization',
    label: 'Highest resource utilization',
    unit: 'percent',
    better: 'lower',
    get: (r) => {
      const values = Object.values(r.pools).map((p) => p.utilization);
      return values.length ? Math.max(...values) : null;
    }
  },
  { id: 'rework', label: 'Rework rate', unit: 'percent', better: 'lower', get: (r) => r.kpis.reworkRate }
];

function series(run: SimulationRun, get: Extract): number[] {
  return run.replications.map((r) => get(r, run)).filter((v): v is number => v !== null && Number.isFinite(v));
}

export function compareRuns(asIs: SimulationRun, toBe: SimulationRun): ComparisonResult {
  const paired = asIs.seed === toBe.seed && asIs.replicationCount === toBe.replicationCount && asIs.replicationCount > 1;
  const metrics: MetricComparison[] = [];
  for (const m of METRICS) {
    const a = series(asIs, m.get);
    const b = series(toBe, m.get);
    if (!a.length || !b.length) continue;
    const ea = estimate(a);
    const eb = estimate(b);
    let differenceCi = NaN;
    let method: MetricComparison['method'] = 'none';
    if (paired && a.length === b.length) {
      const d = estimate(b.map((v, i) => v - a[i]));
      differenceCi = d.ciHalfWidth;
      method = 'paired';
    } else if (a.length > 1 && b.length > 1) {
      const va = ea.sd ** 2 / a.length;
      const vb = eb.sd ** 2 / b.length;
      const df = (va + vb) ** 2 / ((va ** 2) / (a.length - 1) + (vb ** 2) / (b.length - 1) || 1);
      differenceCi = tQuantile975(Math.max(1, Math.floor(df))) * Math.sqrt(va + vb);
      method = 'welch';
    }
    const difference = eb.mean - ea.mean;
    const base = Math.abs(ea.mean) > 1e-12 ? Math.abs(ea.mean) : NaN;
    const improvement = (m.better === 'lower' ? -difference : difference) / base;
    metrics.push({
      id: m.id,
      label: m.label,
      unit: m.unit,
      better: m.better,
      asIs: ea.mean,
      toBe: eb.mean,
      asIsCi: ea.ciHalfWidth,
      toBeCi: eb.ciHalfWidth,
      difference,
      differenceCi,
      improvement,
      significant: Number.isFinite(differenceCi) ? Math.abs(difference) > differenceCi : null,
      method
    });
  }

  const bottleneckOf = (run: SimulationRun) => {
    let best: { id: string; name: string; waiting: number } | undefined;
    for (const a of Object.values(run.activities)) {
      const w = a.waiting.mean;
      if (Number.isFinite(w) && w > 0.01 && (!best || w > best.waiting)) best = { id: a.id, name: a.name, waiting: w };
    }
    return best;
  };
  const maxUtil = (run: SimulationRun) => {
    let best: { name: string; value: number } | undefined;
    for (const p of Object.values(run.pools)) if (!best || p.utilization.mean > best.value) best = { name: p.name, value: p.utilization.mean };
    return best;
  };
  const ba = bottleneckOf(asIs);
  const bb = bottleneckOf(toBe);

  return {
    metrics,
    paired,
    conditionDifferences: experimentConditionDifferences(asIs.config, toBe.config),
    bottleneck: { asIs: ba, toBe: bb, moved: !!ba && !!bb && ba.name !== bb.name },
    maxUtilization: { asIs: maxUtil(asIs), toBe: maxUtil(toBe) }
  };
}

/** Annualized cost-benefit of a redesign. */
export function costBenefit(costPerCaseAsIs: number, costPerCaseToBe: number, casesPerYear: number, investment: number) {
  const annualAsIs = costPerCaseAsIs * casesPerYear;
  const annualToBe = costPerCaseToBe * casesPerYear;
  const annualSaving = annualAsIs - annualToBe;
  const paybackMonths = annualSaving > 0 ? (investment / annualSaving) * 12 : Infinity;
  const threeYearNet = annualSaving * 3 - investment;
  return { annualAsIs, annualToBe, annualSaving, paybackMonths, threeYearNet };
}
