import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../../src/data/examples';
import { applyPreset } from '../../src/data/examples/preset';
import { buildBpmnXml } from '../../src/domain/bpmn/builder';
import { parseBpmnXml } from '../../src/domain/bpmn/parse';
import { createDefaultConfig } from '../../src/domain/simulation/config';
import { runExperiment } from '../../src/domain/simulation/experiment';
import { compareRuns, costBenefit } from '../../src/domain/simulation/compare';

async function runExample(id: string, patch: Record<string, unknown> = {}) {
  const ex = EXAMPLES.find((e) => e.id === id)!;
  const { graph } = await parseBpmnXml(buildBpmnXml(ex.spec));
  const config = { ...applyPreset(createDefaultConfig(graph), ex.sim!, graph), ...patch };
  return runExperiment(graph, config);
}

describe('AS-IS vs TO-BE comparison', () => {
  it('detects a significant cycle-time improvement with paired replications', async () => {
    const asIs = await runExample('claims-as-is', { replications: 6, numberOfCases: 300 });
    const toBe = await runExample('claims-to-be', { replications: 6, numberOfCases: 300 });
    const cmp = compareRuns(asIs, toBe);
    expect(cmp.paired).toBe(true);
    expect(cmp.conditionDifferences).toEqual([]);
    const ct = cmp.metrics.find((m) => m.id === 'cycleTime')!;
    expect(ct.toBe).toBeLessThan(ct.asIs);
    expect(ct.improvement).toBeGreaterThan(0.1);
    expect(ct.significant).toBe(true);
    expect(ct.method).toBe('paired');
  });

  it('identical alternatives show zero difference under common random numbers', async () => {
    const a = await runExample('claims-as-is', { replications: 4, numberOfCases: 150 });
    const b = await runExample('claims-as-is', { replications: 4, numberOfCases: 150 });
    const cmp = compareRuns(a, b);
    for (const m of cmp.metrics) expect(m.difference).toBeCloseTo(0, 9);
  });

  it('discloses different experimental conditions', async () => {
    const a = await runExample('claims-as-is', { replications: 3, numberOfCases: 100 });
    const b = await runExample('claims-to-be', { replications: 3, numberOfCases: 120, seed: 7 });
    const cmp = compareRuns(a, b);
    expect(cmp.paired).toBe(false);
    expect(cmp.conditionDifferences.join(' ')).toMatch(/Number of cases/);
    expect(cmp.conditionDifferences.join(' ')).toMatch(/seed/);
    expect(cmp.metrics[0].method).toBe('welch');
  });

  it('computes cost-benefit figures', () => {
    const r = costBenefit(30, 25, 10000, 25000);
    expect(r.annualSaving).toBe(50000);
    expect(r.paybackMonths).toBeCloseTo(6, 6);
    expect(r.threeYearNet).toBe(125000);
  });
});
