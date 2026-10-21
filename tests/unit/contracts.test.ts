import { describe, expect, it } from 'vitest';
import Ajv from 'ajv';
import processModelSchema from '../../src/domain/contracts/schemas/process-model.schema.json';
import simulationConfigSchema from '../../src/domain/contracts/schemas/simulation-config.schema.json';
import simulationRunSchema from '../../src/domain/contracts/schemas/simulation-run.schema.json';
import eventLogSchema from '../../src/domain/contracts/schemas/event-log.schema.json';
import assessmentSchema from '../../src/domain/contracts/schemas/assessment-result.schema.json';
import scenarioSchema from '../../src/domain/contracts/schemas/educational-scenario.schema.json';
import { EXAMPLES } from '../../src/data/examples';
import { CHALLENGES, getChallenge } from '../../src/data/challenges';
import { buildBpmnXml } from '../../src/domain/bpmn/builder';
import { parseBpmnXml } from '../../src/domain/bpmn/parse';
import { createDefaultConfig } from '../../src/domain/simulation/config';
import { applyPreset } from '../../src/domain/simulation/preset';
import { runExperiment, serializeRun } from '../../src/domain/simulation/experiment';
import { eventLogToJson } from '../../src/domain/simulation/eventLog';
import { evaluateDeadlock } from '../../src/domain/assessment/evaluate';
import { PROCESS_MODEL_SCHEMA_VERSION, SCENARIO_SCHEMA_VERSION, type ProcessModelMetadata } from '../../src/domain/contracts';
import type { DeadlockChallenge } from '../../src/domain/assessment/types';

const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
ajv.addSchema([processModelSchema, simulationConfigSchema, simulationRunSchema, eventLogSchema, assessmentSchema, scenarioSchema]);

function check(schemaId: string, data: unknown) {
  const validate = ajv.getSchema(schemaId)!;
  const ok = validate(JSON.parse(JSON.stringify(data)));
  return ok ? [] : (validate.errors ?? []).map((e) => `${e.instancePath} ${e.message}`);
}

const ID = (name: string) => `https://schemas.bpmn-studio.org/${name}/v1.json`;

describe('data contracts (JSON Schema)', () => {
  it('every schema compiles in strict mode (conditional "required" allowed)', () => {
    for (const name of ['process-model', 'simulation-config', 'simulation-run', 'event-log', 'assessment-result', 'educational-scenario']) {
      expect(ajv.getSchema(ID(name)), name).toBeTruthy();
    }
  });

  it('process model metadata', () => {
    const now = new Date().toISOString();
    const meta: ProcessModelMetadata & { xml: string } = {
      schemaVersion: PROCESS_MODEL_SCHEMA_VERSION,
      id: 'd-1',
      name: 'Order',
      description: '',
      createdAt: now,
      updatedAt: now,
      version: 1,
      origin: { kind: 'example', ref: 'order-fulfillment' },
      tags: [],
      xml: buildBpmnXml(EXAMPLES[0].spec)
    };
    expect(check(ID('process-model'), meta)).toEqual([]);
    expect(check(ID('process-model'), { ...meta, origin: { kind: 'somewhere' } })).not.toEqual([]);
  });

  it.each(EXAMPLES.filter((e) => e.sim).map((e) => [e.id, e] as const))('simulation config of example %s', async (_id, ex) => {
    const { graph } = await parseBpmnXml(buildBpmnXml(ex.spec));
    const config = applyPreset(createDefaultConfig(graph), ex.sim!, graph);
    expect(check(ID('simulation-config'), config)).toEqual([]);
  });

  it('simulation run and event log', async () => {
    const ex = EXAMPLES.find((e) => e.id === 'claims-as-is')!;
    const { graph } = await parseBpmnXml(buildBpmnXml(ex.spec));
    const config = { ...applyPreset(createDefaultConfig(graph), ex.sim!, graph), numberOfCases: 200, replications: 2 };
    const run = runExperiment(graph, config, { modelName: ex.name });
    expect(check(ID('simulation-run'), serializeRun(run))).toEqual([]);

    const log = eventLogToJson(run.replications[0].eventLog, { modelName: ex.name, runId: run.runId, seed: run.seed, replication: 0, epoch: '2026-01-05T08:00:00.000Z' });
    expect(log.events.length).toBe(run.replications[0].eventLog.length * 2);
    expect(check(ID('event-log'), log)).toEqual([]);
    // sorted by time
    const times = log.events.map((e) => Date.parse(e.timestamp));
    expect(times.every((t, i) => i === 0 || t >= times[i - 1])).toBe(true);
  });

  it('assessment result', async () => {
    const ch = getChallenge('deadlock-credit') as DeadlockChallenge;
    const { graph } = await parseBpmnXml(buildBpmnXml(ch.spec));
    expect(check(ID('assessment-result'), evaluateDeadlock(ch, graph, 'Join', 0))).toEqual([]);
    expect(check(ID('assessment-result'), evaluateDeadlock(ch, graph, null, null))).toEqual([]);
  });

  it.each(CHALLENGES.map((c) => [c.id, c] as const))('educational scenario %s', (_id, ch) => {
    expect(check(ID('educational-scenario'), { schemaVersion: SCENARIO_SCHEMA_VERSION, ...ch })).toEqual([]);
  });

  it('rejects an incomplete scenario', () => {
    expect(check(ID('educational-scenario'), { schemaVersion: 1, id: 'x', type: 'predict', title: 'X', level: 1, minutes: 5, summary: 's', scenario: 'A scenario that is long enough.', hints: ['h'], concepts: ['c'] })).not.toEqual([]);
  });
});
