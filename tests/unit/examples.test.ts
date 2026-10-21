import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../../src/data/examples';
import { buildBpmnXml } from '../../src/domain/bpmn/builder';
import { parseBpmnXml } from '../../src/domain/bpmn/parse';
import { analyseModel } from '../../src/domain/bpmn/behavior';
import { validateModel } from '../../src/domain/validation/validate';
import { applyPreset } from '../../src/data/examples/preset';
import { createDefaultConfig } from '../../src/domain/simulation/config';
import { runExperiment } from '../../src/domain/simulation/experiment';

describe('example library', () => {
  it.each(EXAMPLES.map((e) => [e.id, e] as const))('%s parses, is sound and validates without errors', async (_id, ex) => {
    const xml = buildBpmnXml(ex.spec);
    const { graph, warnings, definitions } = await parseBpmnXml(xml);
    expect(warnings).toEqual([]);
    const analysis = analyseModel(graph);
    expect(analysis.sound).toBe(true);
    const report = await validateModel({ definitions, graph });
    const errors = report.issues.filter((i) => i.severity === 'error');
    expect(errors.map((e) => `${e.ruleId}: ${e.explanation}`)).toEqual([]);
    const warns = report.issues.filter((i) => i.severity === 'warning');
    expect(warns.map((e) => `${e.ruleId}: ${e.explanation}`)).toEqual([]);
  });

  it.each(EXAMPLES.filter((e) => e.sim).map((e) => [e.id, e] as const))('%s simulates with its preset', async (_id, ex) => {
    const { graph } = await parseBpmnXml(buildBpmnXml(ex.spec));
    const config = applyPreset(createDefaultConfig(graph), ex.sim!, graph);
    const run = runExperiment(graph, { ...config, replications: 2, numberOfCases: 150 });
    expect(run.replications[0].cases.completed).toBeGreaterThan(100);
    expect(run.support.findings.filter((f) => f.level === 'blocking')).toEqual([]);
    expect(run.kpis.cycleTime.mean).toBeGreaterThan(0);
  });
});
