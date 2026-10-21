import { describe, expect, it } from 'vitest';
import { CHALLENGES, getChallenge } from '../../src/data/challenges';
import { EXAMPLES } from '../../src/data/examples';
import { buildBpmnXml, type DiagramSpec } from '../../src/domain/bpmn/builder';
import { parseBpmnXml } from '../../src/domain/bpmn/parse';
import { validateModel } from '../../src/domain/validation/validate';
import { deadlockCulprits, evaluateComparison, evaluateDeadlock, evaluateModelChallenge, evaluatePrediction, expectedExecution } from '../../src/domain/assessment/evaluate';
import { assessmentConfig, performanceOutcome } from '../../src/domain/assessment/improve';
import type { CompareChallenge, DeadlockChallenge, ImproveChallenge, ModelChallenge, PredictChallenge } from '../../src/domain/assessment/types';
import { runExperiment } from '../../src/domain/simulation/experiment';
import { createDefaultConfig } from '../../src/domain/simulation/config';
import { applyPreset } from '../../src/domain/simulation/preset';
import { splitJoin, decision } from '../../src/data/encyclopedia/patterns';

async function assess(id: string, spec: DiagramSpec) {
  const ch = getChallenge(id) as ModelChallenge;
  const xml = buildBpmnXml(spec);
  const { graph, definitions } = await parseBpmnXml(xml);
  const report = await validateModel({ definitions, graph });
  return evaluateModelChallenge(ch, { graph, report });
}

const unmet = (r: Awaited<ReturnType<typeof assess>>) => r.criteria.filter((c) => c.status !== 'met').map((c) => `${c.label}: ${c.feedback}`);

describe('challenge catalog', () => {
  it('covers all six challenge types', () => {
    expect(new Set(CHALLENGES.map((c) => c.type))).toEqual(new Set(['build', 'fix', 'predict', 'deadlock', 'improve', 'compare']));
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
  });

  it.each(CHALLENGES.filter((c) => 'start' in c && c.start).map((c) => [c.id, c] as const))('%s start model parses', async (_id, c) => {
    const { warnings } = await parseBpmnXml(buildBpmnXml((c as ModelChallenge).start!));
    expect(warnings).toEqual([]);
  });

  it('the starting models of fix and build challenges do not pass', async () => {
    for (const c of CHALLENGES) {
      if (c.type !== 'build' && c.type !== 'fix') continue;
      const r = await assess(c.id, c.start!);
      expect(r.passed, c.id).toBe(false);
      expect(r.nextConcept, c.id).toBeTruthy();
    }
  });
});

describe('build and fix challenges accept correct, behaviorally equivalent solutions', () => {
  it('build-order', async () => {
    const solution = decision('exclusiveGateway', { start: 'Order received', before: 'Check stock', gateway: 'All items in stock?', fa: 'yes', fb: 'no', a: 'Ship order', b: 'Cancel order', endA: 'Order shipped', endB: 'Order cancelled' });
    const r = await assess('build-order', solution);
    expect(unmet(r)).toEqual([]);
    expect(r.passed).toBe(true);
    expect(r.score).toBe(1);
  });

  it('build-order rejects a model that always ships and cancels', async () => {
    const wrong = splitJoin('parallelGateway', 'parallelGateway', { start: 'Order received', a: 'Ship order', b: 'Cancel order', c: 'Check stock' });
    const r = await assess('build-order', wrong);
    expect(r.passed).toBe(false);
    const labels = r.criteria.filter((c) => c.status === 'not-met').map((c) => c.label);
    expect(labels.some((l) => l.includes('alternatives'))).toBe(true);
  });

  it('build-onboarding: parallel solution passes, sequential solution fails', async () => {
    const ok = splitJoin('parallelGateway', 'parallelGateway', { start: 'Contract signed', a: 'Create user account', b: 'Prepare laptop', c: 'Welcome employee', end: 'Employee onboarded' });
    expect(unmet(await assess('build-onboarding', ok))).toEqual([]);
    const seq: DiagramSpec = {
      nodes: [
        { id: 'S', type: 'startEvent', name: 'Contract signed', at: [0, 0] },
        { id: 'A', type: 'task', name: 'Create user account', at: [1, 0] },
        { id: 'B', type: 'task', name: 'Prepare laptop', at: [2, 0] },
        { id: 'C', type: 'task', name: 'Welcome employee', at: [3, 0] },
        { id: 'E', type: 'endEvent', name: 'Onboarded', at: [4, 0] }
      ],
      flows: [
        { from: 'S', to: 'A' },
        { from: 'A', to: 'B' },
        { from: 'B', to: 'C' },
        { from: 'C', to: 'E' }
      ]
    };
    const r = await assess('build-onboarding', seq);
    expect(r.passed).toBe(false);
    expect(r.criteria.find((c) => c.label.includes('parallel') && c.dimension === 'behavior')?.status).toBe('not-met');
  });

  it('fix-shipping and fix-sync are solved by matching the join type', async () => {
    expect(unmet(await assess('fix-shipping', splitJoin('exclusiveGateway', 'exclusiveGateway', { start: 'Order packed', split: 'Express delivery?', fa: 'yes', fb: 'no', a: 'Ship express', b: 'Ship standard', c: 'Send tracking number', end: 'Order shipped' })))).toEqual([]);
    expect(unmet(await assess('fix-sync', splitJoin('parallelGateway', 'parallelGateway', { start: 'Order accepted', a: 'Pack goods', b: 'Send invoice', c: 'Ship order', end: 'Order shipped' })))).toEqual([]);
  });

  it('fix-loop is solved by a decision with an exit', async () => {
    const solution: DiagramSpec = {
      nodes: [
        { id: 'Start', type: 'startEvent', name: 'Article submitted', at: [0, 0] },
        { id: 'Merge', type: 'exclusiveGateway', at: [1, 0] },
        { id: 'Review', type: 'userTask', name: 'Review article', at: [2, 0] },
        { id: 'Problems', type: 'exclusiveGateway', name: 'Problems found?', at: [3, 0] },
        { id: 'Revise', type: 'userTask', name: 'Revise article', at: [3, 1.3] },
        { id: 'Publish', type: 'task', name: 'Publish article', at: [4, 0] },
        { id: 'End', type: 'endEvent', name: 'Article published', at: [5, 0] }
      ],
      flows: [
        { from: 'Start', to: 'Merge' },
        { from: 'Merge', to: 'Review' },
        { from: 'Review', to: 'Problems' },
        { from: 'Problems', to: 'Revise', name: 'yes' },
        { from: 'Revise', to: 'Merge', route: 'below' },
        { from: 'Problems', to: 'Publish', name: 'no' },
        { from: 'Publish', to: 'End' }
      ]
    };
    expect(unmet(await assess('fix-loop', solution))).toEqual([]);
  });

  it('build-deadline requires an interrupting timer boundary event', async () => {
    const solution: DiagramSpec = {
      nodes: [
        { id: 'S', type: 'startEvent', name: 'Claim received', at: [0, 0] },
        { id: 'Assess', type: 'userTask', name: 'Assess claim', at: [1, 0] },
        { id: 'T', type: 'boundaryEvent', event: 'timer', timer: 'P5D', name: '5 days', attachedTo: 'Assess' },
        { id: 'Senior', type: 'userTask', name: 'Senior expert takes over', at: [2, 1.2] },
        { id: 'M', type: 'exclusiveGateway', at: [3, 0] },
        { id: 'Settle', type: 'task', name: 'Settle claim', at: [4, 0] },
        { id: 'E', type: 'endEvent', name: 'Claim settled', at: [5, 0] }
      ],
      flows: [
        { from: 'S', to: 'Assess' },
        { from: 'Assess', to: 'M' },
        { from: 'T', to: 'Senior' },
        { from: 'Senior', to: 'M' },
        { from: 'M', to: 'Settle' },
        { from: 'Settle', to: 'E' }
      ]
    };
    expect(unmet(await assess('build-deadline', solution))).toEqual([]);
  });

  it('build-collab and fix-collab accept a two-pool collaboration', async () => {
    const solution: DiagramSpec = {
      pools: [
        { id: 'P_Purchasing', name: 'Purchasing department', rows: [0, 0] },
        { id: 'P_Supplier', name: 'Supplier', rows: [1.2, 1.2], blackBox: true }
      ],
      nodes: [
        { id: 'S', type: 'startEvent', name: 'Material needed', at: [0, 0] },
        { id: 'Send', type: 'sendTask', name: 'Send purchase order', at: [1, 0] },
        { id: 'Wait', type: 'intermediateCatchEvent', event: 'message', name: 'Confirmation received', at: [2, 0] },
        { id: 'Book', type: 'task', name: 'Book order', at: [3, 0] },
        { id: 'E', type: 'endEvent', name: 'Order booked', at: [4, 0] }
      ],
      flows: [
        { from: 'S', to: 'Send' },
        { from: 'Send', to: 'Wait' },
        { from: 'Wait', to: 'Book' },
        { from: 'Book', to: 'E' }
      ],
      messageFlows: [
        { from: 'Send', to: 'P_Supplier', name: 'purchase order' },
        { from: 'P_Supplier', to: 'Wait', name: 'confirmation' }
      ]
    };
    expect(unmet(await assess('build-collab', solution))).toEqual([]);

    const shop: DiagramSpec = {
      pools: [
        { id: 'P_Customer', name: 'Customer', rows: [-1, -1], blackBox: true },
        { id: 'P_Shop', name: 'Online shop', rows: [0, 0] }
      ],
      nodes: [
        { id: 'S', type: 'startEvent', event: 'message', name: 'Order received', at: [0, 0] },
        { id: 'Check', type: 'userTask', name: 'Check order', at: [1, 0] },
        { id: 'Ship', type: 'task', name: 'Ship goods', at: [2, 0] },
        { id: 'E', type: 'endEvent', name: 'Goods shipped', at: [3, 0] }
      ],
      flows: [
        { from: 'S', to: 'Check' },
        { from: 'Check', to: 'Ship' },
        { from: 'Ship', to: 'E' }
      ],
      messageFlows: [{ from: 'P_Customer', to: 'S', name: 'order' }]
    };
    expect(unmet(await assess('fix-collab', shop))).toEqual([]);
  });
});

describe('predict, deadlock and compare challenges', () => {
  it('evaluates predictions against the token game', async () => {
    const ch = getChallenge('predict-order') as PredictChallenge;
    const { graph } = await parseBpmnXml(buildBpmnXml(ch.spec));
    expect(expectedExecution(ch, graph, 'invalid')).toEqual(['Task_Check', 'Task_Notify']);
    const right = evaluatePrediction(ch, graph, { valid: ['Task_Check', 'Task_Pack', 'Task_Invoice', 'Task_Ship'], invalid: ['Task_Check', 'Task_Notify'] });
    expect(right.passed).toBe(true);
    const wrong = evaluatePrediction(ch, graph, { valid: ['Task_Check', 'Task_Pack', 'Task_Ship'], invalid: ['Task_Check'] });
    expect(wrong.passed).toBe(false);
    expect(wrong.criteria[0].feedback).toMatch(/Send invoice/);
  });

  it('handles interrupting and non-interrupting boundary scenarios', async () => {
    const ch = getChallenge('predict-boundary') as PredictChallenge;
    const { graph } = await parseBpmnXml(buildBpmnXml(ch.spec));
    expect(expectedExecution(ch, graph, 'fast')).toEqual(['Approve', 'Grant']);
    expect(expectedExecution(ch, graph, 'slow')).toEqual(['Approve', 'Grant', 'SendRemind']);
    expect(expectedExecution(ch, graph, 'never')).toEqual(['Approve', 'SendRemind', 'Escalate']);
  });

  it('locates deadlock culprits', async () => {
    for (const id of ['deadlock-credit', 'deadlock-tests']) {
      const ch = getChallenge(id) as DeadlockChallenge;
      const { graph } = await parseBpmnXml(buildBpmnXml(ch.spec));
      const { joins, splits } = deadlockCulprits(graph);
      expect(joins.length, id).toBeGreaterThan(0);
      expect(splits.length, id).toBeGreaterThan(0);
      expect(evaluateDeadlock(ch, graph, joins[0], ch.correctOption).passed).toBe(true);
      expect(evaluateDeadlock(ch, graph, 'Start', ch.correctOption).passed).toBe(false);
    }
    const ch = getChallenge('deadlock-credit') as DeadlockChallenge;
    const { graph } = await parseBpmnXml(buildBpmnXml(ch.spec));
    expect(deadlockCulprits(graph)).toEqual({ joins: ['Join'], splits: ['CreditOk'] });
  });

  it('compare-pooling: the pooled team wins and the reasoning is checked', async () => {
    const ch = getChallenge('compare-pooling') as CompareChallenge;
    const values: Record<string, number> = {};
    for (const alt of ch.alternatives) {
      const { graph } = await parseBpmnXml(buildBpmnXml(alt.spec));
      const run = runExperiment(graph, applyPreset(createDefaultConfig(graph), alt.sim, graph));
      values[alt.id] = run.kpis.cycleTime.mean;
    }
    expect(values.pooled).toBeLessThan(values.specialized);
    expect(evaluateComparison(ch, values, 'pooled', 0).passed).toBe(true);
    expect(evaluateComparison(ch, values, 'specialized', 3).passed).toBe(false);
  });
});

describe('improve challenge', () => {
  const ch = getChallenge('improve-claims') as ImproveChallenge;

  async function assessImprove(spec: DiagramSpec, sim: (typeof EXAMPLES)[number]['sim']) {
    const xml = buildBpmnXml(spec);
    const { graph, definitions } = await parseBpmnXml(xml);
    const studentConfig = applyPreset(createDefaultConfig(graph), sim!, graph);
    const { config } = assessmentConfig(ch, graph, studentConfig);
    const run = runExperiment(graph, config);
    const report = await validateModel({ definitions, graph });
    return evaluateModelChallenge(ch, { graph, report, performance: performanceOutcome(run) });
  }

  it('the AS-IS process misses the targets', async () => {
    const r = await assessImprove(ch.start, ch.sim);
    expect(r.passed).toBe(false);
    expect(r.criteria.filter((c) => c.dimension === 'performance' && c.status === 'not-met').length).toBeGreaterThan(0);
  });

  it('the suggested redesign meets all targets', async () => {
    const toBe = EXAMPLES.find((e) => e.id === 'claims-to-be')!;
    const r = await assessImprove(toBe.spec, toBe.sim);
    expect(unmet(r as never)).toEqual([]);
    expect(r.passed).toBe(true);
  });

  it('adding workers beyond the budget is not accepted', async () => {
    const sim = structuredClone(ch.sim);
    sim.pools = sim.pools.map((p) => ({ ...p, capacity: p.capacity + 2 }));
    const r = await assessImprove(ch.start, sim);
    expect(r.criteria.find((c) => c.id === 'budget')?.status).toBe('not-met');
  });
});
