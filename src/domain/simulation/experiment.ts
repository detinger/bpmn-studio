/**
 * Simulation experiments: independent replications, aggregation and
 * confidence intervals.
 */
import type { ProcessGraph } from '../bpmn/graph';
import type { SimulationConfig } from './config';
import { runReplication, type ReplicationResult, type RunOptions } from './engine';
import { estimate, type Estimate } from './stats';
import { checkPerformanceSupport, type SupportReport } from './support';

export const SIMULATION_RUN_SCHEMA_VERSION = 1;

export interface KpiEstimates {
  cycleTime: Estimate;
  processingTime: Estimate;
  waitingTime: Estimate;
  throughputPerHour: Estimate;
  wipAvg: Estimate;
  slaCompliance: Estimate;
  costPerCase: Estimate;
  reworkRate: Estimate;
  cycleTimeP90: Estimate;
}

export interface ActivityEstimate {
  id: string;
  name: string;
  executions: Estimate;
  processing: Estimate;
  waiting: Estimate;
  queueLengthAvg: Estimate;
  cost: Estimate;
}

export interface PoolEstimate {
  id: string;
  name: string;
  capacity: number;
  utilization: Estimate;
  queueLengthAvg: Estimate;
  cost: Estimate;
}

export interface SimulationRun {
  schemaVersion: typeof SIMULATION_RUN_SCHEMA_VERSION;
  runId: string;
  createdAt: string;
  modelId?: string;
  modelName?: string;
  modelVersion?: number;
  configId: string;
  configVersion: number;
  seed: number;
  replicationCount: number;
  config: SimulationConfig;
  support: SupportReport;
  kpis: KpiEstimates;
  activities: Record<string, ActivityEstimate>;
  pools: Record<string, PoolEstimate>;
  /** Full results of every replication (event log only for the first). */
  replications: ReplicationResult[];
  warnings: string[];
  durationMs: number;
}

export interface ExperimentMeta {
  modelId?: string;
  modelName?: string;
  modelVersion?: number;
  runId?: string;
}

export type ProgressFn = (done: number, total: number) => void;

/** Run for export (contract: schemas/simulation-run.schema.json) without per-replication event logs and traces. */
export function serializeRun(run: SimulationRun): Omit<SimulationRun, 'replications'> & { replications: Array<Omit<ReplicationResult, 'eventLog' | 'trace'>> } {
  return { ...run, replications: run.replications.map(({ eventLog: _log, trace: _trace, ...r }) => r) };
}

export class SimulationNotRunnableError extends Error {
  constructor(readonly support: SupportReport) {
    super(support.findings.filter((f) => f.level === 'blocking').map((f) => f.message).join(' '));
    this.name = 'SimulationNotRunnableError';
  }
}

export function runExperiment(
  graph: ProcessGraph,
  config: SimulationConfig,
  meta: ExperimentMeta = {},
  onProgress?: ProgressFn,
  options: RunOptions = {}
): SimulationRun {
  const support = checkPerformanceSupport(graph, config);
  if (!support.runnable) throw new SimulationNotRunnableError(support);
  const started = Date.now();
  const reps: ReplicationResult[] = [];
  const n = Math.max(1, Math.floor(config.replications));
  for (let r = 0; r < n; r++) {
    reps.push(runReplication(graph, config, r, { ...options, collectEventLog: r === 0 && (options.collectEventLog ?? true), traceLimit: r === 0 ? options.traceLimit : 0 }));
    onProgress?.(r + 1, n);
  }
  return aggregate(reps, config, support, meta, Date.now() - started);
}

export function aggregate(reps: ReplicationResult[], config: SimulationConfig, support: SupportReport, meta: ExperimentMeta, durationMs: number): SimulationRun {
  const est = (f: (r: ReplicationResult) => number | null | undefined) => estimate(reps.map((r) => f(r)).filter((v): v is number => v !== null && v !== undefined));
  const kpis: KpiEstimates = {
    cycleTime: est((r) => r.kpis.cycleTime.mean),
    processingTime: est((r) => r.kpis.processingTime.mean),
    waitingTime: est((r) => r.kpis.waitingTime.mean),
    throughputPerHour: est((r) => r.kpis.throughputPerHour),
    wipAvg: est((r) => r.kpis.wipAvg),
    slaCompliance: est((r) => r.kpis.slaCompliance),
    costPerCase: est((r) => r.kpis.costPerCase.mean),
    reworkRate: est((r) => r.kpis.reworkRate),
    cycleTimeP90: est((r) => r.kpis.cycleTime.p90)
  };

  const activities: Record<string, ActivityEstimate> = {};
  const first = reps[0];
  for (const id of Object.keys(first?.activities ?? {})) {
    activities[id] = {
      id,
      name: first.activities[id].name,
      executions: est((r) => r.activities[id]?.executions),
      processing: est((r) => r.activities[id]?.processing.mean),
      waiting: est((r) => r.activities[id]?.waiting.mean),
      queueLengthAvg: est((r) => r.activities[id]?.queueLengthAvg),
      cost: est((r) => r.activities[id]?.cost)
    };
  }
  const pools: Record<string, PoolEstimate> = {};
  for (const id of Object.keys(first?.pools ?? {})) {
    pools[id] = {
      id,
      name: first.pools[id].name,
      capacity: first.pools[id].capacity,
      utilization: est((r) => r.pools[id]?.utilization),
      queueLengthAvg: est((r) => r.pools[id]?.queueLengthAvg),
      cost: est((r) => r.pools[id]?.cost)
    };
  }

  const warnings: string[] = [];
  const incomplete = reps.reduce((a, r) => a + r.cases.incomplete, 0);
  if (incomplete > 0) {
    const where = new Map<string, number>();
    for (const r of reps) for (const i of r.incomplete) where.set(i.elementId, (where.get(i.elementId) ?? 0) + i.count);
    const top = [...where.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id);
    warnings.push(
      `${incomplete} measured case(s) did not complete. Tokens remained at: ${top.join(', ')}. This usually indicates a deadlock (e.g. a parallel join waiting for a branch that was never activated) — the KPIs only include completed cases.`
    );
  }
  const rejected = reps.reduce((a, r) => a + r.cases.rejected, 0);
  if (rejected > 0) warnings.push(`${rejected} case(s) were rejected because a queue reached its capacity; they are excluded from cycle-time statistics.`);
  if (reps.some((r) => r.stoppedBy !== 'completed')) warnings.push('At least one replication was stopped by the maximum simulation time or event limit; results are truncated.');
  if (reps.length === 1) warnings.push('Only one replication: no confidence intervals can be computed. Use at least 5 replications for experiments.');
  for (const p of Object.values(pools)) {
    if (p.utilization.mean > 0.95) warnings.push(`Resource pool "${p.name}" is utilized ${(p.utilization.mean * 100).toFixed(0)}%: queues may grow without bound for longer runs (unstable system).`);
  }

  return {
    schemaVersion: SIMULATION_RUN_SCHEMA_VERSION,
    runId: meta.runId ?? `run-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    modelId: meta.modelId,
    modelName: meta.modelName,
    modelVersion: meta.modelVersion,
    configId: config.id,
    configVersion: config.version,
    seed: config.seed,
    replicationCount: reps.length,
    config,
    support,
    kpis,
    activities,
    pools,
    replications: reps,
    warnings,
    durationMs
  };
}
