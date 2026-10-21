/**
 * Simulation configuration used to assess "Improve a process" challenges.
 *
 * The workload, seed, replications and the durations of the scenario's
 * activities are fixed by the challenge; only the student's model structure,
 * task types (automation), resource assignment and pool sizes vary. This
 * keeps the assessment fair: targets cannot be met by editing input data.
 */
import type { ProcessGraph } from '../bpmn/graph';
import { createDefaultConfig, configurableElements, type SimulationConfig } from '../simulation/config';
import { applyPreset } from '../simulation/preset';
import type { SimulationRun } from '../simulation/experiment';
import { matchRole, type PerformanceOutcome } from './evaluate';
import type { ImproveChallenge } from './types';

const AUTOMATED_TYPES = new Set(['bpmn:ServiceTask', 'bpmn:ScriptTask', 'bpmn:BusinessRuleTask', 'bpmn:SendTask']);

export const ASSESSMENT_SEED = 2024;

export function assessmentConfig(ch: ImproveChallenge, graph: ProcessGraph, student: SimulationConfig | undefined): { config: SimulationConfig; notes: string[] } {
  const notes: string[] = [];
  const base = applyPreset(createDefaultConfig(graph, 'assessment', 'Assessment'), ch.sim, graph);
  const config: SimulationConfig = structuredClone(base);
  config.seed = ASSESSMENT_SEED;
  config.replications = ch.sim.replications ?? 5;
  config.warmUp = { kind: 'cases', count: 20 };

  // pools: student's sizes and queue disciplines, preset cost rates
  const presetRate = new Map(ch.sim.pools.map((p) => [p.id, p.costPerHour]));
  const maxRate = Math.max(...ch.sim.pools.map((p) => p.costPerHour), 40);
  if (student?.resourcePools?.length) {
    config.resourcePools = student.resourcePools.map((p) => ({
      ...structuredClone(p),
      costPerHour: presetRate.get(p.id) ?? maxRate,
      calendar: ch.sim.pools.find((q) => q.id === p.id)?.calendar ?? null
    }));
  }
  const poolIds = new Set(config.resourcePools.map((p) => p.id));

  // activities: role-based durations
  const roleOf = new Map<string, string>();
  for (const r of ch.roles) for (const id of matchRole(graph, r)) if (!roleOf.has(id)) roleOf.set(id, r.id);
  const { activities, gateways } = configurableElements(graph);
  for (const a of activities) {
    const role = roleOf.get(a.id);
    const rd = role ? ch.roleDurations[role] : undefined;
    const automated = AUTOMATED_TYPES.has(a.type);
    const duration = rd ? (automated && rd.automated ? rd.automated : rd.duration) : ch.defaultDuration;
    const studentPool = student?.activities?.[a.id]?.resourcePoolId ?? null;
    const presetPool = ch.sim.activities[a.id]?.pool ?? null;
    let pool = studentPool && poolIds.has(studentPool) ? studentPool : presetPool && poolIds.has(presetPool) ? presetPool : null;
    if (automated && rd?.automated) pool = null;
    if (!automated && !pool && config.resourcePools[0]) pool = config.resourcePools[0].id;
    config.activities[a.id] = {
      duration: structuredClone(duration),
      resourcePoolId: pool,
      fixedCost: automated ? 0.2 : ch.sim.activities[a.id]?.fixedCost ?? 0,
      queueCapacity: null
    };
    if (rd && automated && rd.automated) notes.push(`“${a.name}” is automated (${a.type.replace('bpmn:', '')}), so the automated duration is used.`);
    if (!role) notes.push(`“${a.name || a.id}” is not part of the scenario; a default duration is assumed.`);
  }
  for (const g of gateways) {
    const probs = student?.gateways?.[g.id]?.probabilities;
    if (probs) config.gateways[g.id] = { probabilities: { ...probs } };
    else if (ch.sim.gateways?.[g.id]) config.gateways[g.id] = { probabilities: { ...ch.sim.gateways[g.id] } };
  }
  return { config, notes };
}

export function performanceOutcome(run: SimulationRun): PerformanceOutcome {
  const pools = Object.values(run.pools);
  return {
    values: {
      cycleTime: run.kpis.cycleTime.mean,
      cycleTimeP90: run.kpis.cycleTimeP90.mean,
      waitingTime: run.kpis.waitingTime.mean,
      costPerCase: run.kpis.costPerCase.mean,
      slaCompliance: run.kpis.slaCompliance.mean,
      maxUtilization: pools.length ? Math.max(...pools.map((p) => p.utilization.mean)) : 0
    },
    totalWorkers: run.config.resourcePools.filter((p) => Object.values(run.config.activities).some((a) => a.resourcePoolId === p.id)).reduce((a, p) => a + p.capacity, 0),
    incompleteCases: run.replications.reduce((a, r) => a + r.cases.incomplete, 0)
  };
}
