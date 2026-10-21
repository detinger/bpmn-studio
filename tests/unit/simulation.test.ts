import { describe, expect, it } from 'vitest';
import type { DiagramSpec } from '../../src/domain/bpmn/builder';
import { createDefaultConfig, type SimulationConfig } from '../../src/domain/simulation/config';
import { meanOf, sample, type Distribution } from '../../src/domain/simulation/distributions';
import { runReplication } from '../../src/domain/simulation/engine';
import { eventLogToCsv, eventLogToXes } from '../../src/domain/simulation/eventLog';
import { runExperiment } from '../../src/domain/simulation/experiment';
import { Xoshiro128 } from '../../src/domain/simulation/random';
import { checkPerformanceSupport } from '../../src/domain/simulation/support';
import { officeHours } from '../../src/domain/resources/calendar';
import { graphOf, splitJoin } from './helpers';

const SINGLE: DiagramSpec = {
  nodes: [
    { id: 'S', type: 'startEvent', at: [0, 0] },
    { id: 'A', type: 'userTask', name: 'Serve', at: [1, 0] },
    { id: 'E', type: 'endEvent', at: [2, 0] }
  ],
  flows: [
    { from: 'S', to: 'A' },
    { from: 'A', to: 'E' }
  ]
};

function baseConfig(graph: Parameters<typeof createDefaultConfig>[0], patch: Partial<SimulationConfig> = {}): SimulationConfig {
  const c = createDefaultConfig(graph);
  c.warmUp = { kind: 'none' };
  c.sla = null;
  c.replications = 1;
  return { ...c, ...patch };
}

describe('random numbers and distributions', () => {
  it('xoshiro128** is reproducible and roughly uniform', () => {
    const a = new Xoshiro128(42);
    const b = new Xoshiro128(42);
    const xs = Array.from({ length: 10000 }, () => a.next());
    const ys = Array.from({ length: 10000 }, () => b.next());
    expect(xs).toEqual(ys);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });

  it.each<Distribution>([
    { type: 'constant', value: 7 },
    { type: 'uniform', min: 2, max: 10 },
    { type: 'triangular', min: 2, mode: 5, max: 14 },
    { type: 'normal', mean: 20, sd: 4 },
    { type: 'lognormal', mean: 12, sd: 6 },
    { type: 'exponential', mean: 9 },
    { type: 'empirical', values: [1, 2, 10], weights: [1, 1, 2] }
  ])('sample mean of %o matches its analytical mean', (d) => {
    const rng = new Xoshiro128(7);
    const n = 60000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const x = sample(d, rng);
      expect(x).toBeGreaterThanOrEqual(0);
      sum += x;
    }
    expect(sum / n).toBeCloseTo(meanOf(d), 0);
  });

  it('normal distribution never yields negative durations', () => {
    const rng = new Xoshiro128(3);
    for (let i = 0; i < 20000; i++) expect(sample({ type: 'normal', mean: 1, sd: 5 }, rng)).toBeGreaterThanOrEqual(0);
  });
});

describe('discrete-event engine', () => {
  it('deterministic single server without congestion', async () => {
    const { graph } = await graphOf(SINGLE);
    const cfg = baseConfig(graph, { arrival: { kind: 'fixed', interval: 10 }, numberOfCases: 50 });
    cfg.activities.A = { ...cfg.activities.A, duration: { type: 'constant', value: 5 } };
    cfg.resourcePools[0].capacity = 1;
    const r = runReplication(graph, cfg, 0);
    expect(r.cases.completed).toBe(50);
    expect(r.kpis.cycleTime.mean).toBeCloseTo(5, 6);
    expect(r.kpis.waitingTime.mean).toBeCloseTo(0, 6);
    // 50 jobs * 5 minutes of work in a window of 49*10 + 5 = 495 minutes
    expect(r.pools['pool-staff'].utilization).toBeCloseTo(250 / 495, 4);
  });

  it('deterministic overloaded server: waiting grows linearly (FIFO)', async () => {
    const { graph } = await graphOf(SINGLE);
    const cfg = baseConfig(graph, { arrival: { kind: 'fixed', interval: 10 }, numberOfCases: 20 });
    cfg.activities.A = { ...cfg.activities.A, duration: { type: 'constant', value: 15 } };
    cfg.resourcePools[0].capacity = 1;
    const r = runReplication(graph, cfg, 0);
    // case k waits 5(k-1) minutes
    expect(r.kpis.waitingTime.mean).toBeCloseTo((5 * 19) / 2, 6);
    expect(r.kpis.waitingTime.max).toBeCloseTo(95, 6);
    expect(r.pools['pool-staff'].utilization).toBeCloseTo(1, 6);
  });

  it('M/M/1 waiting time matches queueing theory (Wq = ρ/(μ−λ))', async () => {
    const { graph } = await graphOf(SINGLE);
    const cfg = baseConfig(graph, { arrival: { kind: 'poisson', interval: 10 }, numberOfCases: 40000, warmUp: { kind: 'cases', count: 1000 } });
    cfg.activities.A = { ...cfg.activities.A, duration: { type: 'exponential', mean: 5 } };
    cfg.resourcePools[0].capacity = 1;
    const r = runReplication(graph, cfg, 0, { collectEventLog: false });
    const Wq = 0.5 / (0.2 - 0.1);
    expect(r.kpis.waitingTime.mean).toBeGreaterThan(Wq * 0.9);
    expect(r.kpis.waitingTime.mean).toBeLessThan(Wq * 1.1);
    expect(r.pools['pool-staff'].utilization).toBeGreaterThan(0.48);
    expect(r.pools['pool-staff'].utilization).toBeLessThan(0.52);
    // Little's law: L = λ W
    const lambda = r.kpis.throughputPerHour / 60;
    expect(r.kpis.wipAvg).toBeCloseTo(lambda * r.kpis.cycleTime.mean, 1);
  });

  it('M/M/2 waiting time matches the Erlang-C formula', async () => {
    const { graph } = await graphOf(SINGLE);
    const cfg = baseConfig(graph, { arrival: { kind: 'poisson', interval: 1 / 0.15 }, numberOfCases: 60000, warmUp: { kind: 'cases', count: 2000 } });
    cfg.activities.A = { ...cfg.activities.A, duration: { type: 'exponential', mean: 10 } };
    cfg.resourcePools[0].capacity = 2;
    const r = runReplication(graph, cfg, 0, { collectEventLog: false });
    const Wq = 1.9285714 / 0.15; // Lq / λ with a = 1.5, c = 2
    expect(r.kpis.waitingTime.mean).toBeGreaterThan(Wq * 0.88);
    expect(r.kpis.waitingTime.mean).toBeLessThan(Wq * 1.12);
  });

  it('is reproducible for equal seeds and differs for different seeds', async () => {
    const { graph } = await graphOf(SINGLE);
    const cfg = baseConfig(graph, { numberOfCases: 300 });
    const a = runReplication(graph, cfg, 0);
    const b = runReplication(graph, cfg, 0);
    expect(a.kpis).toEqual(b.kpis);
    expect(a.eventLog).toEqual(b.eventLog);
    const c = runReplication(graph, { ...cfg, seed: 999 }, 0);
    expect(c.kpis.cycleTime.mean).not.toEqual(a.kpis.cycleTime.mean);
    const d = runReplication(graph, cfg, 1);
    expect(d.kpis.cycleTime.mean).not.toEqual(a.kpis.cycleTime.mean);
  });

  it('resource constraints affect cycle time', async () => {
    const { graph } = await graphOf(SINGLE);
    const one = baseConfig(graph, { arrival: { kind: 'poisson', interval: 6 }, numberOfCases: 2000 });
    one.activities.A = { ...one.activities.A, duration: { type: 'exponential', mean: 5 } };
    one.resourcePools[0].capacity = 1;
    const three = structuredClone(one);
    three.resourcePools[0].capacity = 3;
    const r1 = runReplication(graph, one, 0);
    const r3 = runReplication(graph, three, 0);
    expect(r1.kpis.cycleTime.mean).toBeGreaterThan(r3.kpis.cycleTime.mean * 2);
    // common random numbers: the processing time of each case is identical
    expect(r1.kpis.processingTime.mean).toBeCloseTo(r3.kpis.processingTime.mean, 9);
  });

  it('parallel branches: cycle time is the longest branch', async () => {
    const { graph } = await graphOf(splitJoin('parallelGateway', 'parallelGateway'));
    const cfg = baseConfig(graph, { arrival: { kind: 'fixed', interval: 100 }, numberOfCases: 10 });
    cfg.activities.A = { duration: { type: 'constant', value: 5 }, resourcePoolId: null, fixedCost: 0, queueCapacity: null };
    cfg.activities.B = { duration: { type: 'constant', value: 8 }, resourcePoolId: null, fixedCost: 0, queueCapacity: null };
    cfg.activities.C = { duration: { type: 'constant', value: 2 }, resourcePoolId: null, fixedCost: 0, queueCapacity: null };
    const r = runReplication(graph, cfg, 0);
    expect(r.kpis.cycleTime.mean).toBeCloseTo(10, 6);
    expect(r.kpis.processingTime.mean).toBeCloseTo(15, 6);
  });

  it('exclusive gateway routes with configured probabilities', async () => {
    const { graph } = await graphOf(splitJoin('exclusiveGateway', 'exclusiveGateway'));
    const cfg = baseConfig(graph, { numberOfCases: 5000 });
    cfg.gateways.G1 = { probabilities: { fa: 0.7, fb: 0.3 } };
    const r = runReplication(graph, cfg, 0, { collectEventLog: false });
    const d = r.gatewayDecisions.G1;
    expect(d.fa / (d.fa + d.fb)).toBeGreaterThan(0.67);
    expect(d.fa / (d.fa + d.fb)).toBeLessThan(0.73);
    expect(r.activities.A.executions + r.activities.B.executions).toBe(5000);
  });

  it('inclusive gateway join waits for all activated branches', async () => {
    const { graph } = await graphOf(splitJoin('inclusiveGateway', 'inclusiveGateway'));
    const cfg = baseConfig(graph, { numberOfCases: 2000, arrival: { kind: 'fixed', interval: 100 } });
    cfg.gateways.G1 = { probabilities: { fa: 0.5, fb: 0.5 } };
    for (const id of ['A', 'B', 'C']) cfg.activities[id] = { duration: { type: 'constant', value: id === 'B' ? 8 : 4 }, resourcePoolId: null, fixedCost: 0, queueCapacity: null };
    const r = runReplication(graph, cfg, 0, { collectEventLog: false });
    expect(r.cases.completed).toBe(2000);
    expect(r.activities.C.executions).toBe(2000);
    // cycle time is 8 (A only), 12 (B only or both)
    expect(r.kpis.cycleTime.min).toBeCloseTo(8, 6);
    expect(r.kpis.cycleTime.max).toBeCloseTo(12, 6);
  });

  it('interrupting timer boundary event cancels long activities', async () => {
    const { graph } = await graphOf({
      nodes: [
        { id: 'S', type: 'startEvent', at: [0, 0] },
        { id: 'A', type: 'userTask', name: 'Slow work', at: [1, 0] },
        { id: 'T', type: 'boundaryEvent', event: 'timer', timer: 'PT10M', attachedTo: 'A', at: [1, 0] },
        { id: 'E', type: 'endEvent', at: [2, 0] },
        { id: 'X', type: 'task', name: 'Escalate', at: [2, 1] },
        { id: 'EX', type: 'endEvent', at: [3, 1] }
      ],
      flows: [
        { from: 'S', to: 'A' },
        { from: 'A', to: 'E' },
        { from: 'T', to: 'X' },
        { from: 'X', to: 'EX' }
      ]
    });
    const cfg = baseConfig(graph, { arrival: { kind: 'fixed', interval: 100 }, numberOfCases: 20 });
    cfg.activities.A = { ...cfg.activities.A, duration: { type: 'constant', value: 30 } };
    cfg.activities.X = { duration: { type: 'constant', value: 1 }, resourcePoolId: null, fixedCost: 0, queueCapacity: null };
    const r = runReplication(graph, cfg, 0);
    expect(r.activities.A.cancelled).toBe(20);
    expect(r.activities.A.executions).toBe(0);
    expect(r.activities.X.executions).toBe(20);
    expect(r.kpis.cycleTime.mean).toBeCloseTo(11, 6);
    expect(r.eventLog.filter((e) => e.status === 'cancelled')).toHaveLength(20);
  });

  it('reports incomplete cases for deadlocking models instead of misleading KPIs', async () => {
    const { graph } = await graphOf(splitJoin('exclusiveGateway', 'parallelGateway'));
    const cfg = baseConfig(graph, { numberOfCases: 50, replications: 2 });
    const run = runExperiment(graph, cfg);
    expect(run.replications[0].cases.completed).toBe(0);
    expect(run.replications[0].cases.incomplete).toBe(50);
    expect(run.replications[0].incomplete[0].elementId).toBe('G2');
    expect(run.warnings.join(' ')).toMatch(/did not complete/);
  });

  it('calendars: work only starts during shifts', async () => {
    const { graph } = await graphOf(SINGLE);
    const cfg = baseConfig(graph, { arrival: { kind: 'poisson', interval: 30 }, numberOfCases: 400, calendarOffset: 0 });
    cfg.activities.A = { ...cfg.activities.A, duration: { type: 'constant', value: 10 } };
    cfg.resourcePools[0].calendar = officeHours(8 * 60, 16 * 60);
    cfg.resourcePools[0].capacity = 1;
    const r = runReplication(graph, cfg, 0);
    expect(r.cases.completed).toBe(400);
    for (const e of r.eventLog) {
      const minuteOfWeek = e.start % (7 * 1440);
      const day = Math.floor(minuteOfWeek / 1440);
      const minuteOfDay = minuteOfWeek % 1440;
      expect(day).toBeLessThan(5);
      expect(minuteOfDay).toBeGreaterThanOrEqual(8 * 60 - 1e-6);
      expect(minuteOfDay).toBeLessThan(16 * 60);
    }
  });

  it('warm-up cases are excluded from statistics', async () => {
    const { graph } = await graphOf(SINGLE);
    const cfg = baseConfig(graph, { numberOfCases: 100, warmUp: { kind: 'cases', count: 30 } });
    const r = runReplication(graph, cfg, 0);
    expect(r.cases.measured).toBe(70);
    expect(r.cases.completed).toBe(70);
    expect(r.warmUpEnd).toBeGreaterThan(0);
  });

  it('priority queues serve high-priority cases first', async () => {
    const { graph } = await graphOf(SINGLE);
    const cfg = baseConfig(graph, { arrival: { kind: 'poisson', interval: 5.5 }, numberOfCases: 3000, priorities: [{ value: 1, probability: 0.3 }, { value: 0, probability: 0.7 }] });
    cfg.activities.A = { ...cfg.activities.A, duration: { type: 'exponential', mean: 5 } };
    cfg.resourcePools[0].capacity = 1;
    cfg.resourcePools[0].discipline = 'PRIORITY';
    const fifo = structuredClone(cfg);
    fifo.resourcePools[0].discipline = 'FIFO';
    const rp = runReplication(graph, cfg, 0);
    const rf = runReplication(graph, fifo, 0);
    // overall mean waiting is similar (work conserving), but its variance differs
    expect(rp.kpis.waitingTime.mean).toBeGreaterThan(rf.kpis.waitingTime.mean * 0.7);
    expect(rp.kpis.waitingTime.p50).toBeLessThan(rf.kpis.waitingTime.p50);
  });

  it('queue capacity rejects excess cases', async () => {
    const { graph } = await graphOf(SINGLE);
    const cfg = baseConfig(graph, { arrival: { kind: 'fixed', interval: 1 }, numberOfCases: 100 });
    cfg.activities.A = { ...cfg.activities.A, duration: { type: 'constant', value: 10 }, queueCapacity: 3 };
    cfg.resourcePools[0].capacity = 1;
    const r = runReplication(graph, cfg, 0);
    expect(r.cases.rejected).toBeGreaterThan(50);
    expect(r.activities.A.queueLengthMax).toBeLessThanOrEqual(3);
  });

  it('multi-instance parallel activities use several workers', async () => {
    const spec: DiagramSpec = structuredClone(SINGLE);
    spec.nodes[1].loop = 'parallel';
    spec.nodes[1].loopCardinality = 3;
    const { graph } = await graphOf(spec);
    const cfg = baseConfig(graph, { arrival: { kind: 'fixed', interval: 1000 }, numberOfCases: 5 });
    cfg.activities.A = { ...cfg.activities.A, duration: { type: 'constant', value: 10 }, instances: 3 };
    cfg.resourcePools[0].capacity = 3;
    expect(runReplication(graph, cfg, 0).kpis.cycleTime.mean).toBeCloseTo(10, 6);
    cfg.resourcePools[0].capacity = 1;
    expect(runReplication(graph, cfg, 0).kpis.cycleTime.mean).toBeCloseTo(30, 6);
  });

  it('sub-processes take the time of their content', async () => {
    const { graph } = await graphOf({
      nodes: [
        { id: 'S', type: 'startEvent', at: [0, 0] },
        { id: 'SP', type: 'subProcess', name: 'Handle', at: [2, 0] },
        { id: 'SS', type: 'startEvent', at: [1.2, 0], parent: 'SP' },
        { id: 'ST', type: 'task', name: 'Inner', at: [2, 0], parent: 'SP' },
        { id: 'SE', type: 'endEvent', at: [2.8, 0], parent: 'SP' },
        { id: 'E', type: 'endEvent', at: [4, 0] }
      ],
      flows: [
        { from: 'S', to: 'SP' },
        { from: 'SS', to: 'ST' },
        { from: 'ST', to: 'SE' },
        { from: 'SP', to: 'E' }
      ]
    });
    const cfg = baseConfig(graph, { arrival: { kind: 'fixed', interval: 100 }, numberOfCases: 5 });
    cfg.activities.ST = { duration: { type: 'constant', value: 7 }, resourcePoolId: null, fixedCost: 0, queueCapacity: null };
    const r = runReplication(graph, cfg, 0);
    expect(r.kpis.cycleTime.mean).toBeCloseTo(7, 6);
  });

  it('refuses unsupported constructs explicitly', async () => {
    const { graph } = await graphOf({
      nodes: [
        { id: 'S', type: 'startEvent', at: [0, 0] },
        { id: 'G', type: 'complexGateway', at: [1, 0] },
        { id: 'E', type: 'endEvent', at: [2, 0] }
      ],
      flows: [
        { from: 'S', to: 'G' },
        { from: 'G', to: 'E' }
      ]
    });
    const support = checkPerformanceSupport(graph, createDefaultConfig(graph));
    expect(support.runnable).toBe(false);
    expect(support.findings.find((f) => f.code === 'complex-gateway')?.elementIds).toEqual(['G']);
    expect(() => runExperiment(graph, createDefaultConfig(graph))).toThrow(/Complex gateway/);
  });

  it('aggregates replications with confidence intervals', async () => {
    const { graph } = await graphOf(SINGLE);
    const cfg = baseConfig(graph, { replications: 8, numberOfCases: 300 });
    const run = runExperiment(graph, cfg);
    expect(run.replications).toHaveLength(8);
    expect(run.kpis.cycleTime.n).toBe(8);
    expect(run.kpis.cycleTime.ciHalfWidth).toBeGreaterThan(0);
    expect(run.replications[1].eventLog).toHaveLength(0);
  });

  it('exports event logs as CSV and XES', async () => {
    const { graph } = await graphOf(SINGLE);
    const r = runReplication(graph, baseConfig(graph, { numberOfCases: 10 }), 0);
    const meta = { modelName: 'Test & <model>', runId: 'run-1', seed: 1, replication: 0, epoch: '2026-01-05T08:00:00.000Z' };
    const csv = eventLogToCsv(r.eventLog, meta);
    expect(csv.split('\n')[0]).toBe('case_id,activity,activity_id,resource,lifecycle,timestamp,sim_time_min,waiting_min,cost');
    expect(csv.trim().split('\n')).toHaveLength(1 + 20);
    const xes = eventLogToXes(r.eventLog, meta);
    expect(xes).toContain('<trace>');
    expect(xes).toContain('Test &amp; &lt;model&gt;');
    expect((xes.match(/<event>/g) ?? []).length).toBe(20);
  });
});
