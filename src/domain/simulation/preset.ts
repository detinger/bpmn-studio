import type { ProcessGraph } from '../bpmn/graph';
import { syncConfigWithGraph, type ArrivalConfig, type ResourcePoolConfig, type SimulationConfig } from './config';
import type { Distribution } from './distributions';

export interface SimulationPreset {
  arrival: ArrivalConfig;
  numberOfCases?: number;
  replications?: number;
  slaMinutes?: number;
  waitingCostPerHour?: number;
  pools: ResourcePoolConfig[];
  activities: Record<string, { duration: Distribution; pool?: string; fixedCost?: number; repeatProbability?: number; instances?: number }>;
  gateways?: Record<string, Record<string, number>>;
  events?: Record<string, { delay?: Distribution; probability?: number }>;
}



/** Apply an example's simulation preset on top of a default configuration. */
export function applyPreset(base: SimulationConfig, preset: SimulationPreset, graph: ProcessGraph): SimulationConfig {
  const config: SimulationConfig = structuredClone(base);
  config.arrival = structuredClone(preset.arrival);
  if (preset.numberOfCases) config.numberOfCases = preset.numberOfCases;
  if (preset.replications) config.replications = preset.replications;
  if (preset.slaMinutes !== undefined) config.sla = { cycleTimeTarget: preset.slaMinutes };
  if (preset.waitingCostPerHour !== undefined) config.costs = { waitingCostPerHour: preset.waitingCostPerHour };
  config.resourcePools = structuredClone(preset.pools);
  for (const [id, a] of Object.entries(preset.activities)) {
    const existing = config.activities[id];
    config.activities[id] = {
      ...existing,
      queueCapacity: existing?.queueCapacity ?? null,
      duration: structuredClone(a.duration),
      resourcePoolId: a.pool ?? null,
      fixedCost: a.fixedCost ?? 0,
      ...(a.repeatProbability !== undefined ? { repeatProbability: a.repeatProbability } : {}),
      ...(a.instances !== undefined ? { instances: a.instances } : {})
    };
  }
  // activities not mentioned in the preset must not refer to removed default pools
  for (const a of Object.values(config.activities)) {
    if (a.resourcePoolId && !config.resourcePools.some((p) => p.id === a.resourcePoolId)) a.resourcePoolId = config.resourcePools[0]?.id ?? null;
  }
  for (const [id, probs] of Object.entries(preset.gateways ?? {})) config.gateways[id] = { probabilities: { ...probs } };
  for (const [id, ev] of Object.entries(preset.events ?? {})) config.events[id] = { ...config.events[id], ...structuredClone(ev) };
  return syncConfigWithGraph(config, graph).config;
}
