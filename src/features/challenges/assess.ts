import { parseBpmnXml } from '../../domain/bpmn/parse';
import { validateModel } from '../../domain/validation/validate';
import { evaluateModelChallenge, type PerformanceOutcome } from '../../domain/assessment/evaluate';
import { assessmentConfig, performanceOutcome } from '../../domain/assessment/improve';
import type { ImproveChallenge, ModelChallenge } from '../../domain/assessment/types';
import type { AssessmentResult } from '../../domain/contracts';
import type { SimulationConfig } from '../../domain/simulation/config';
import { runSimulation } from '../performance-simulation/simClient';
import { createFromSpec } from '../../services/diagrams';
import { listDiagrams, type StoredDiagram } from '../../storage/db';

export interface ModelAssessment {
  result: AssessmentResult;
  notes: string[];
}

/** Assess a diagram for a build/fix/improve challenge. Improve challenges run a simulation. */
export async function assessModelDiagram(
  ch: ModelChallenge | ImproveChallenge,
  xml: string,
  simConfig: SimulationConfig | undefined,
  onProgress?: (text: string) => void
): Promise<ModelAssessment> {
  const { graph, definitions, warnings } = await parseBpmnXml(xml);
  const report = await validateModel({ definitions, graph, parseWarnings: warnings });
  let performance: PerformanceOutcome | undefined;
  const notes: string[] = [];
  if (ch.type === 'improve') {
    const { config, notes: n } = assessmentConfig(ch, graph, simConfig);
    notes.push(...n);
    try {
      onProgress?.('Simulating your redesign…');
      const run = await runSimulation(xml, config, { modelName: ch.title }, (d, t) => onProgress?.(`Simulating your redesign: replication ${d} of ${t}`)).promise;
      performance = performanceOutcome(run);
    } catch (err) {
      performance = { values: {}, totalWorkers: 0, incompleteCases: 0, error: err instanceof Error ? err.message : String(err) };
    }
  }
  return { result: evaluateModelChallenge(ch, { graph, report, performance }), notes };
}

export async function findChallengeDiagram(challengeId: string): Promise<StoredDiagram | undefined> {
  return (await listDiagrams()).find((d) => d.origin?.kind === 'challenge' && d.origin.ref === challengeId);
}

export async function startChallengeWorkspace(ch: ModelChallenge | ImproveChallenge): Promise<StoredDiagram> {
  const spec = ch.start ?? { nodes: [{ id: 'StartEvent_1', type: 'startEvent' as const, name: 'Start', at: [0, 0] as [number, number] }], flows: [] };
  return createFromSpec(`Challenge: ${ch.title}`, spec, { kind: 'challenge', ref: ch.id }, { description: ch.summary }, ch.type === 'improve' ? ch.sim : undefined);
}
