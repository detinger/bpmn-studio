/**
 * Executability check for the performance (discrete-event) simulator.
 *
 * The simulator supports a documented subset of BPMN. Every model element
 * outside that subset is reported explicitly as either blocking (simulation is
 * refused), approximated (simulated with a documented simplification) or as an
 * assumption (a parameter was not configured and a default is used).
 */
import type { ProcessGraph } from '../bpmn/graph';
import { analysableNodes } from '../bpmn/behavior';
import { configurableElements, selectProcess, type SimulationConfig } from './config';
import { validateDistribution } from './distributions';
import { parseIsoDurationMinutes } from '../../utils/duration';

export type SupportLevel = 'blocking' | 'approximation' | 'assumption';

export interface SupportFinding {
  level: SupportLevel;
  code: string;
  elementIds: string[];
  message: string;
}

export interface SupportReport {
  processId?: string;
  findings: SupportFinding[];
  /** False when at least one blocking finding exists. */
  runnable: boolean;
}

function scopesOf(graph: ProcessGraph, rootId: string): string[] {
  const out = [rootId];
  for (const s of Object.values(graph.scopes)) {
    let p = s.parentScopeId;
    while (p) {
      if (p === rootId) {
        out.push(s.id);
        break;
      }
      p = graph.scopes[p]?.parentScopeId;
    }
  }
  return out;
}

export function checkPerformanceSupport(graph: ProcessGraph, config: SimulationConfig): SupportReport {
  const findings: SupportFinding[] = [];
  const add = (level: SupportLevel, code: string, elementIds: string[], message: string) => findings.push({ level, code, elementIds, message });
  const processId = selectProcess(graph, config);

  if (!processId) {
    add('blocking', 'no-process', [], 'The model contains no process that could be simulated.');
    return { findings, runnable: false };
  }

  const scopeIds = scopesOf(graph, processId);
  const nodes = scopeIds.flatMap((s) => graph.scopes[s].nodeIds.map((id) => graph.nodes[id]));
  const rootNodes = analysableNodes(graph, processId);

  // start
  const starts = rootNodes.filter((n) => n.kind === 'start');
  if (config.arrival.startEventId && !graph.nodes[config.arrival.startEventId]) {
    add('blocking', 'unknown-start', [config.arrival.startEventId], 'The configured start event does not exist in the model.');
  }
  if (starts.length === 0 && !rootNodes.some((n) => n.incoming.length === 0 && n.kind !== 'boundary')) {
    add('blocking', 'no-start', [processId], 'The process has no start event, so no cases can be created.');
  }
  if (starts.length > 1 && !config.arrival.startEventId) {
    add('assumption', 'multiple-starts', starts.map((s) => s.id), `The process has ${starts.length} start events; cases are created at "${starts[0].name || starts[0].id}". Choose another start event in the arrival settings.`);
  }

  if (graph.isCollaboration && graph.rootScopeIds.length > 1) {
    add('approximation', 'collaboration', [processId], 'Only one pool is simulated. Other participants are treated as the environment: message flows are not simulated, and message catch events and receive tasks use their configured waiting times instead.');
  }

  for (const n of nodes) {
    if (n.kind === 'gateway' && n.gateway === 'complex') {
      add('blocking', 'complex-gateway', [n.id], `Complex gateway "${n.name || n.id}" has no simulation semantics in BPMN Studio. Replace it with exclusive, parallel or inclusive gateways.`);
    }
    if (n.kind === 'subProcess' && n.triggeredByEvent) {
      add('approximation', 'event-subprocess', [n.id], `Event sub-process "${n.name || n.id}" is not simulated (it is never triggered).`);
    }
    if (n.type === 'bpmn:AdHocSubProcess') {
      add('approximation', 'adhoc', [n.id], `Ad-hoc sub-process "${n.name || n.id}" is simulated as a single activity using its configured duration.`);
    }
    if (n.type === 'bpmn:Transaction') {
      add('approximation', 'transaction', [n.id], `Transaction "${n.name || n.id}" is simulated as a normal sub-process; cancellation and compensation are not simulated.`);
    }
    if (n.isForCompensation || n.eventDefinition === 'compensate') {
      add('approximation', 'compensation', [n.id], `Compensation ("${n.name || n.id}") is not simulated.`);
    }
    if (n.eventDefinition === 'multiple') {
      add('approximation', 'multiple-event', [n.id], `Event "${n.name || n.id}" has several event definitions; it is simulated like a single event using its configured delay.`);
    }
    if ((n.kind === 'start' && n.eventDefinition && n.eventDefinition !== 'none') && n.scopeId === processId) {
      add('approximation', 'typed-start', [n.id], `Start event "${n.name || n.id}" (${n.eventDefinition}) is triggered by the configured arrival process.`);
    }
    if (n.kind === 'activity' || n.kind === 'subProcess') {
      const conditional = n.outgoing.filter((f) => graph.flows[f]?.condition && !graph.flows[f]?.isDefault);
      if (conditional.length) {
        add('approximation', 'conditional-flow', [n.id, ...conditional], `Conditional sequence flows leaving "${n.name || n.id}" are taken independently with probability 0.5 each (conditions are not evaluated).`);
      }
    }
    if (n.kind === 'intermediateCatch' && n.eventDefinition !== 'link' && n.eventDefinition !== 'timer' && !config.events[n.id]?.delay) {
      add('assumption', 'catch-delay', [n.id], `No waiting time configured for "${n.name || n.id}" (${n.eventDefinition} event); it is assumed to occur immediately.`);
    }
    if (n.kind === 'intermediateCatch' && n.eventDefinition === 'timer' && !config.events[n.id]?.delay) {
      const iso = parseIsoDurationMinutes(n.timerExpression);
      if (iso === null) add('assumption', 'timer-delay', [n.id], `Timer "${n.name || n.id}" has no duration (configure a delay or an ISO-8601 duration such as PT2H); it is assumed to fire immediately.`);
    }
    if (n.kind === 'boundary' && n.eventDefinition === 'timer' && !config.events[n.id]?.delay && parseIsoDurationMinutes(n.timerExpression) === null) {
      add('assumption', 'boundary-timer', [n.id], `Timer boundary event "${n.name || n.id}" has no duration and will never fire.`);
    }
    if (n.kind === 'boundary' && n.eventDefinition !== 'timer' && n.eventDefinition !== 'compensate') {
      const p = config.events[n.id]?.probability ?? 0;
      add('approximation', 'boundary-probability', [n.id], `Boundary event "${n.name || n.id}" (${n.eventDefinition}) occurs with probability ${p} per execution of its activity, at the moment the work would complete.`);
    }
  }

  // configuration completeness
  const { activities, gateways } = configurableElements(graph);
  for (const a of activities) {
    if (!scopeIds.includes(a.scopeId)) continue;
    const cfg = config.activities[a.id];
    if (!cfg) {
      add('assumption', 'activity-default', [a.id], `Activity "${a.name || a.id}" has no simulation parameters; a zero duration without resources is assumed.`);
      continue;
    }
    const errs = validateDistribution(cfg.duration);
    if (errs.length) add('blocking', 'bad-duration', [a.id], `Invalid duration for "${a.name || a.id}": ${errs.join(' ')}`);
    if (cfg.resourcePoolId && !config.resourcePools.some((p) => p.id === cfg.resourcePoolId)) {
      add('blocking', 'unknown-pool', [a.id], `Activity "${a.name || a.id}" refers to a resource pool that does not exist.`);
    }
  }
  for (const g of gateways) {
    if (!scopeIds.includes(g.scopeId)) continue;
    const probs = config.gateways[g.id]?.probabilities;
    if (!probs) {
      add('assumption', 'gateway-default', [g.id], `Gateway "${g.name || g.id}" has no routing probabilities; equal probabilities are assumed.`);
      continue;
    }
    const values = g.outgoing.map((f) => probs[f] ?? 0);
    if (values.some((v) => v < 0 || !Number.isFinite(v))) {
      add('blocking', 'bad-probability', [g.id], `Gateway "${g.name || g.id}" has negative or invalid routing probabilities.`);
    } else if (g.gateway === 'exclusive' || g.gateway === 'eventBased') {
      const sum = values.reduce((a, b) => a + b, 0);
      if (g.gateway === 'eventBased' && sum === 0) {
        // race between event delays
      } else if (sum === 0) {
        add('blocking', 'zero-probability', [g.id], `All routing probabilities of "${g.name || g.id}" are zero.`);
      } else if (Math.abs(sum - 1) > 1e-6) {
        add('assumption', 'normalized', [g.id], `Routing probabilities of "${g.name || g.id}" sum to ${sum.toFixed(3)} and are normalized to 1.`);
      }
    }
  }
  for (const p of config.resourcePools) {
    if (!(p.capacity >= 1) || !Number.isInteger(p.capacity)) add('blocking', 'pool-capacity', [], `Resource pool "${p.name}" must have a whole number of workers ≥ 1.`);
    if (p.calendar && p.calendar.shifts.length === 0) add('blocking', 'pool-calendar', [], `Resource pool "${p.name}" has a calendar without shifts and would never work.`);
  }
  if (config.arrival.kind === 'distribution' && config.arrival.distribution) {
    const errs = validateDistribution(config.arrival.distribution);
    if (errs.length) add('blocking', 'bad-arrival', [], `Invalid inter-arrival distribution: ${errs.join(' ')}`);
  } else if (!(config.arrival.interval > 0)) {
    add('blocking', 'bad-arrival', [], 'The inter-arrival time must be positive.');
  }
  if (!(config.numberOfCases >= 1)) add('blocking', 'cases', [], 'At least one case must be simulated.');
  if (config.warmUp.kind === 'cases' && config.warmUp.count >= config.numberOfCases) {
    add('blocking', 'warmup', [], 'The warm-up period removes all cases; increase the number of cases or shorten the warm-up.');
  }
  if (!(config.replications >= 1)) add('blocking', 'replications', [], 'At least one replication is required.');

  return { processId, findings, runnable: !findings.some((f) => f.level === 'blocking') };
}
