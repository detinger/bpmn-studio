/**
 * Simulation configuration (versioned data contract).
 *
 * Kept strictly separate from BPMN XML: element ids are the only link between
 * the model and its simulation parameters. All times are in minutes.
 */
import type { ProcessGraph } from '../bpmn/graph';
import type { WeeklyCalendar } from '../resources/calendar';
import type { Distribution } from './distributions';

export const SIMULATION_CONFIG_SCHEMA_VERSION = 1;

export type ArrivalKind = 'fixed' | 'poisson' | 'distribution';

export interface ArrivalConfig {
  kind: ArrivalKind;
  /** fixed: interval between arrivals; poisson: mean inter-arrival time (minutes). */
  interval: number;
  /** Inter-arrival distribution for kind = 'distribution'. */
  distribution?: Distribution;
  /** Number of cases per arrival (batch arrivals). Defaults to 1. */
  batchSize?: Distribution;
  /** Start event at which cases are created. Defaults to the first none start event. */
  startEventId?: string;
}

export type QueueDiscipline = 'FIFO' | 'PRIORITY';

export interface ResourcePoolConfig {
  id: string;
  name: string;
  /** Number of interchangeable workers in the pool. */
  capacity: number;
  /** Labor cost per worker-hour while working. */
  costPerHour: number;
  /** Availability calendar; null = always available. */
  calendar: WeeklyCalendar | null;
  discipline: QueueDiscipline;
}

export interface ActivityConfig {
  duration: Distribution;
  /** Pool whose worker performs the activity; null = no resource constraint. */
  resourcePoolId: string | null;
  /** Fixed cost per execution. */
  fixedCost: number;
  /** Max number of work items waiting at this activity; null = unlimited. Further arrivals are rejected. */
  queueCapacity: number | null;
  /** Standard loop activities: probability of another iteration (rework). */
  repeatProbability?: number;
  maxIterations?: number;
  /** Multi-instance activities: number of instances. */
  instances?: number;
}

export interface GatewayConfig {
  /** Routing probabilities per outgoing flow id (normalized for exclusive gateways). */
  probabilities: Record<string, number>;
}

export interface EventConfig {
  /** Waiting time of catch events (timer/message/signal/conditional) or timer boundary delay. */
  delay?: Distribution;
  /** Probability that a non-timer boundary event occurs during one execution of its host. */
  probability?: number;
}

export type WarmUpConfig = { kind: 'none' } | { kind: 'cases'; count: number } | { kind: 'time'; duration: number };

export interface SimulationConfig {
  schemaVersion: typeof SIMULATION_CONFIG_SCHEMA_VERSION;
  id: string;
  name: string;
  /** Monotonic version, incremented on each change. */
  version: number;
  /** Process (root scope) to simulate; defaults to the first process with a start event. */
  processId?: string;
  arrival: ArrivalConfig;
  /** Number of generated cases per replication (warm-up cases included). */
  numberOfCases: number;
  replications: number;
  seed: number;
  warmUp: WarmUpConfig;
  /** Minutes after Monday 00:00 at which simulation time 0 starts (affects calendars). */
  calendarOffset: number;
  /** Safety stop for the simulation clock (minutes). */
  maxSimulationTime: number;
  sla: { cycleTimeTarget: number } | null;
  costs: { waitingCostPerHour: number };
  /** Optional case priorities for priority queues (higher value = served first). */
  priorities: Array<{ value: number; probability: number }>;
  activities: Record<string, ActivityConfig>;
  gateways: Record<string, GatewayConfig>;
  events: Record<string, EventConfig>;
  resourcePools: ResourcePoolConfig[];
}

export const DEFAULT_POOL_ID = 'pool-staff';

function isHumanTask(type: string) {
  return ['bpmn:UserTask', 'bpmn:ManualTask', 'bpmn:Task', 'bpmn:SubProcess', 'bpmn:CallActivity', 'bpmn:ReceiveTask'].includes(type);
}

function isAutomated(type: string) {
  return ['bpmn:ServiceTask', 'bpmn:ScriptTask', 'bpmn:BusinessRuleTask', 'bpmn:SendTask'].includes(type);
}

export function defaultActivityConfig(type: string): ActivityConfig {
  if (isAutomated(type)) {
    return { duration: { type: 'constant', value: 1 }, resourcePoolId: null, fixedCost: 0.1, queueCapacity: null };
  }
  return {
    duration: { type: 'triangular', min: 5, mode: 10, max: 20 },
    resourcePoolId: isHumanTask(type) ? DEFAULT_POOL_ID : null,
    fixedCost: 0,
    queueCapacity: null
  };
}

export function createDefaultConfig(graph: ProcessGraph, id = 'default', name = 'Baseline scenario'): SimulationConfig {
  const config: SimulationConfig = {
    schemaVersion: SIMULATION_CONFIG_SCHEMA_VERSION,
    id,
    name,
    version: 1,
    arrival: { kind: 'poisson', interval: 15 },
    numberOfCases: 200,
    replications: 5,
    seed: 12345,
    warmUp: { kind: 'cases', count: 20 },
    calendarOffset: 8 * 60,
    maxSimulationTime: 60 * 24 * 365,
    sla: { cycleTimeTarget: 120 },
    costs: { waitingCostPerHour: 0 },
    priorities: [],
    activities: {},
    gateways: {},
    events: {},
    resourcePools: [
      { id: DEFAULT_POOL_ID, name: 'Staff', capacity: 2, costPerHour: 40, calendar: null, discipline: 'FIFO' }
    ]
  };
  return syncConfigWithGraph(config, graph).config;
}

export interface SyncResult {
  config: SimulationConfig;
  added: string[];
  removed: string[];
}

/** Elements that receive configuration entries. */
export function configurableElements(graph: ProcessGraph) {
  const nodes = Object.values(graph.nodes);
  const activities = nodes.filter((n) => (n.kind === 'activity' || n.kind === 'subProcess') && !n.triggeredByEvent);
  const gateways = nodes.filter(
    (n) => n.kind === 'gateway' && (n.gateway === 'exclusive' || n.gateway === 'inclusive' || n.gateway === 'eventBased') && n.outgoing.length > 1
  );
  const events = nodes.filter(
    (n) =>
      (n.kind === 'intermediateCatch' && n.eventDefinition !== 'link') ||
      (n.kind === 'boundary' && n.eventDefinition !== 'compensate')
  );
  return { activities, gateways, events };
}

/**
 * Add defaults for new model elements and drop entries of removed elements.
 * Returns a new config object; the version is incremented when anything changed.
 */
export function syncConfigWithGraph(input: SimulationConfig, graph: ProcessGraph): SyncResult {
  const config: SimulationConfig = structuredClone(input);
  const added: string[] = [];
  const removed: string[] = [];
  const { activities, gateways, events } = configurableElements(graph);

  const actIds = new Set(activities.map((a) => a.id));
  for (const a of activities) {
    if (!config.activities[a.id]) {
      config.activities[a.id] = defaultActivityConfig(a.type);
      // expanded sub-processes take their time from their content
      if (a.kind === 'subProcess' && (graph.scopes[a.id]?.nodeIds.length ?? 0) > 0) {
        config.activities[a.id] = { ...config.activities[a.id], duration: { type: 'constant', value: 0 }, resourcePoolId: null };
      }
      if (a.loop === 'standard') config.activities[a.id].repeatProbability = 0.2;
      if (a.loop === 'parallel' || a.loop === 'sequential') config.activities[a.id].instances = a.loopCardinality ?? 3;
      added.push(a.id);
    }
  }
  for (const id of Object.keys(config.activities)) {
    if (!actIds.has(id)) {
      delete config.activities[id];
      removed.push(id);
    }
  }

  const gwIds = new Set(gateways.map((g) => g.id));
  for (const g of gateways) {
    const existing = config.gateways[g.id];
    const outs = g.outgoing;
    if (!existing) {
      const p = g.gateway === 'inclusive' ? 0.5 : 1 / outs.length;
      config.gateways[g.id] = { probabilities: Object.fromEntries(outs.map((f) => [f, round4(p)])) };
      added.push(g.id);
    } else {
      // keep known flows, add new ones with 0, drop stale ones
      const next: Record<string, number> = {};
      for (const f of outs) next[f] = existing.probabilities[f] ?? 0;
      if (JSON.stringify(next) !== JSON.stringify(existing.probabilities)) {
        config.gateways[g.id] = { probabilities: next };
        added.push(g.id);
      }
    }
  }
  for (const id of Object.keys(config.gateways)) {
    if (!gwIds.has(id)) {
      delete config.gateways[id];
      removed.push(id);
    }
  }

  const evIds = new Set(events.map((e) => e.id));
  for (const e of events) {
    if (!config.events[e.id]) {
      config.events[e.id] = e.kind === 'boundary' && e.eventDefinition !== 'timer' ? { probability: 0.1 } : {};
      added.push(e.id);
    }
  }
  for (const id of Object.keys(config.events)) {
    if (!evIds.has(id)) {
      delete config.events[id];
      removed.push(id);
    }
  }

  if (config.arrival.startEventId && !graph.nodes[config.arrival.startEventId]) {
    delete config.arrival.startEventId;
    removed.push('arrival.startEventId');
  }
  if (config.processId && !graph.scopes[config.processId]) {
    delete config.processId;
    removed.push('processId');
  }

  if (added.length || removed.length) config.version = (input.version ?? 0) + 1;
  return { config, added, removed };
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}

/** Process scope that will be simulated. */
export function selectProcess(graph: ProcessGraph, config: Pick<SimulationConfig, 'processId'>): string | undefined {
  if (config.processId && graph.scopes[config.processId]) return config.processId;
  return graph.rootScopeIds.find((id) => graph.scopes[id].nodeIds.some((n) => graph.nodes[n].kind === 'start')) ?? graph.rootScopeIds[0];
}

/**
 * Compare the assumptions of two configurations used in an AS-IS / TO-BE comparison.
 * Returns human-readable differences of the experiment conditions (workload and
 * experimental design). Differences in activities/resources are the redesign itself.
 */
export function experimentConditionDifferences(a: SimulationConfig, b: SimulationConfig): string[] {
  const diffs: string[] = [];
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  if (!same({ ...a.arrival, startEventId: undefined }, { ...b.arrival, startEventId: undefined })) diffs.push('Arrival process differs (workload is not identical).');
  if (a.numberOfCases !== b.numberOfCases) diffs.push(`Number of cases differs (${a.numberOfCases} vs ${b.numberOfCases}).`);
  if (a.replications !== b.replications) diffs.push(`Number of replications differs (${a.replications} vs ${b.replications}).`);
  if (a.seed !== b.seed) diffs.push(`Random seed differs (${a.seed} vs ${b.seed}); common random numbers are not used.`);
  if (!same(a.warmUp, b.warmUp)) diffs.push('Warm-up period differs.');
  if (!same(a.sla, b.sla)) diffs.push('SLA target differs, so SLA compliance is measured against different thresholds.');
  if (!same(a.costs, b.costs)) diffs.push('Waiting cost rate differs.');
  if (!same(a.priorities, b.priorities)) diffs.push('Case priority mix differs.');
  if (a.calendarOffset !== b.calendarOffset) diffs.push('Simulation start time (calendar offset) differs.');
  return diffs;
}
