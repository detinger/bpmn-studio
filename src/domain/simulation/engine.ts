/**
 * Discrete-event simulation (DES) engine for BPMN process performance analysis.
 *
 * This engine is independent of the token animation used for teaching
 * execution semantics. It advances a simulation clock from event to event
 * (next-event time advance), manages resource pools with explicit queues and
 * calendars, samples stochastic durations from reproducible random streams and
 * records case-level and time-weighted statistics.
 *
 * Semantics and assumptions are documented in
 * docs/simulation-semantics/performance-simulation.md.
 */
import type { GraphNode, ProcessGraph } from '../bpmn/graph';
import { analysableNodes } from '../bpmn/behavior';
import { CalendarClock } from '../resources/calendar';
import { parseIsoDurationMinutes } from '../../utils/duration';
import type { ActivityConfig, ResourcePoolConfig, SimulationConfig } from './config';
import { selectProcess } from './config';
import { sample, type Distribution } from './distributions';
import { EventQueue, type Scheduled } from './heap';
import { StreamFactory, Xoshiro128, streamSeed, type Rng } from './random';
import { summarize, thin, TimeWeighted, type Summary } from './stats';

// ---------------------------------------------------------------------------
// Result types

export interface ActivityResult {
  id: string;
  name: string;
  type: string;
  executions: number;
  reworkExecutions: number;
  cancelled: number;
  rejected: number;
  processing: Summary;
  waiting: Summary;
  queueLengthAvg: number;
  queueLengthMax: number;
  cost: number;
}

export interface PoolResult {
  id: string;
  name: string;
  capacity: number;
  /** Busy time within scheduled time / scheduled capacity time. */
  utilization: number;
  busyTime: number;
  availableTime: number;
  overtime: number;
  queueLengthAvg: number;
  queueLengthMax: number;
  cost: number;
}

export interface PathVariant {
  path: string[];
  count: number;
}

export interface TimelinePoint {
  t: number;
  wip: number;
  completed: number;
}

export type TraceEventType =
  | 'arrival'
  | 'enqueue'
  | 'start'
  | 'complete'
  | 'decision'
  | 'event'
  | 'boundary'
  | 'cancel'
  | 'reject'
  | 'case-complete'
  | 'warm-up-end'
  | 'shift';

export interface TraceEvent {
  t: number;
  type: TraceEventType;
  caseId?: number;
  elementId?: string;
  detail?: string;
}

export interface EventLogEntry {
  caseId: number;
  activityId: string;
  activity: string;
  resource: string;
  /** Time the work item became ready (entered the queue). */
  enqueued: number;
  start: number;
  end: number;
  status: 'complete' | 'cancelled';
  cost: number;
}

export interface ReplicationResult {
  replication: number;
  seed: number;
  warmUpEnd: number;
  endTime: number;
  eventsProcessed: number;
  stoppedBy: 'completed' | 'max-time' | 'max-events';
  cases: {
    generated: number;
    measured: number;
    completed: number;
    incomplete: number;
    rejected: number;
    failed: number;
  };
  kpis: {
    cycleTime: Summary;
    processingTime: Summary;
    waitingTime: Summary;
    costPerCase: Summary;
    throughputPerHour: number;
    wipAvg: number;
    wipMax: number;
    slaCompliance: number | null;
    totalCost: number;
    reworkRate: number;
  };
  activities: Record<string, ActivityResult>;
  pools: Record<string, PoolResult>;
  gatewayDecisions: Record<string, Record<string, number>>;
  paths: PathVariant[];
  incomplete: Array<{ elementId: string; count: number }>;
  samples: { cycleTimes: number[]; waitingTimes: number[]; processingTimes: number[] };
  timeline: TimelinePoint[];
  trace: TraceEvent[];
  eventLog: EventLogEntry[];
}

export interface RunOptions {
  maxEvents?: number;
  traceLimit?: number;
  eventLogLimit?: number;
  sampleLimit?: number;
  collectEventLog?: boolean;
}

// ---------------------------------------------------------------------------
// Internal state

interface CaseState {
  id: number;
  arrival: number;
  priority: number;
  measured: boolean;
  root?: ScopeInst;
  completed?: number;
  rejected: boolean;
  failed: boolean;
  processing: number;
  waiting: number;
  cost: number;
  path: string[];
  executions: Map<string, number>;
  rework: number;
  streams: Map<string, Xoshiro128>;
}

interface ScopeInst {
  scopeId: string;
  caseState: CaseState;
  parent?: ScopeInst;
  host?: ActivityInst;
  alive: number;
  held: Map<string, number>;
  joins: Map<string, Map<string, number>>;
  activities: Set<ActivityInst>;
  waits: Set<Scheduled<Ev>>;
  children: Set<ScopeInst>;
  done: boolean;
}

interface WorkItem {
  ai: ActivityInst;
  enqueued: number;
  seq: number;
  started?: number;
  duration?: number;
  pool?: PoolState;
  worker?: number;
  completion?: Scheduled<Ev>;
  done: boolean;
}

interface ActivityInst {
  node: GraphNode;
  cfg: ActivityConfig;
  scope: ScopeInst;
  caseState: CaseState;
  arrived: number;
  state: 'active' | 'done' | 'cancelled';
  items: Set<WorkItem>;
  iteration: number;
  instancesStarted: number;
  instancesTotal: number;
  sequential: boolean;
  timers: Scheduled<Ev>[];
  child?: ScopeInst;
  forcedDuration?: number;
  boundaryOutcome?: GraphNode;
}

interface PoolState {
  cfg: ResourcePoolConfig;
  busy: boolean[];
  busyCount: TimeWeighted;
  available: TimeWeighted;
  overtime: TimeWeighted;
  queue: WorkItem[];
  queueLen: TimeWeighted;
  calendar?: CalendarClock;
  open: boolean;
  cost: number;
}

interface ActivityStats {
  node: GraphNode;
  executions: number;
  rework: number;
  cancelled: number;
  rejected: number;
  processing: number[];
  waiting: number[];
  waitingNow: number;
  queue: TimeWeighted;
  cost: number;
}

type Ev =
  | { type: 'arrival' }
  | { type: 'workDone'; item: WorkItem }
  | { type: 'waitDone'; scope: ScopeInst; node: GraphNode }
  | { type: 'boundaryTimer'; ai: ActivityInst; boundary: GraphNode }
  | { type: 'shift'; pool: PoolState }
  | { type: 'warmUpEnd' };

const DEFAULT_ACTIVITY: ActivityConfig = {
  duration: { type: 'constant', value: 0 },
  resourcePoolId: null,
  fixedCost: 0,
  queueCapacity: null
};

// ---------------------------------------------------------------------------

export function runReplication(graph: ProcessGraph, config: SimulationConfig, replication: number, options: RunOptions = {}): ReplicationResult {
  const maxEvents = options.maxEvents ?? 3_000_000;
  const traceLimit = options.traceLimit ?? 1500;
  const eventLogLimit = options.eventLogLimit ?? 50_000;
  const sampleLimit = options.sampleLimit ?? 4000;
  const collectLog = options.collectEventLog ?? true;

  const processId = selectProcess(graph, config);
  if (!processId) throw new Error('No process to simulate');

  const streams = new StreamFactory(config.seed, replication);
  const queue = new EventQueue<Ev>();
  let now = 0;
  /** Time of the last event that was not a calendar change. */
  let lastWorkTime = 0;
  let shiftEventsQueued = 0;
  let warmUpEnd = config.warmUp.kind === 'none' ? 0 : Number.POSITIVE_INFINITY;
  let warmUpDone = config.warmUp.kind === 'none';

  const trace: TraceEvent[] = [];
  const log = (type: TraceEventType, caseId?: number, elementId?: string, detail?: string) => {
    if (trace.length < traceLimit) trace.push({ t: now, type, caseId, elementId, detail });
  };
  const eventLog: EventLogEntry[] = [];

  // ---- static structure ------------------------------------------------------
  const poolStates = new Map<string, PoolState>();
  for (const p of config.resourcePools) {
    const calendar = p.calendar ? new CalendarClock(p.calendar, config.calendarOffset) : undefined;
    const open = calendar ? calendar.isOpen(0) : true;
    const state: PoolState = {
      cfg: p,
      busy: Array.from({ length: Math.max(1, Math.floor(p.capacity)) }, () => false),
      busyCount: new TimeWeighted(),
      available: new TimeWeighted(),
      overtime: new TimeWeighted(),
      queue: [],
      queueLen: new TimeWeighted(),
      calendar,
      open,
      cost: 0
    };
    state.available.set(0, open ? state.busy.length : 0);
    poolStates.set(p.id, state);
    if (calendar) {
      const next = calendar.nextChange(0);
      if (Number.isFinite(next)) {
        queue.push(next, { type: 'shift', pool: state }, -1);
        shiftEventsQueued++;
      }
    }
  }

  const activityStats = new Map<string, ActivityStats>();
  const statsFor = (node: GraphNode): ActivityStats => {
    let s = activityStats.get(node.id);
    if (!s) {
      s = { node, executions: 0, rework: 0, cancelled: 0, rejected: 0, processing: [], waiting: [], waitingNow: 0, queue: new TimeWeighted(), cost: 0 };
      if (warmUpDone) s.queue.reset(now);
      else s.queue.reset(0);
      activityStats.set(node.id, s);
    }
    return s;
  };
  // pre-create stats for all activities of the simulated scopes for stable output
  const simulatedScopes = new Set<string>([processId]);
  for (const s of Object.values(graph.scopes)) {
    let p = s.parentScopeId;
    while (p) {
      if (p === processId) {
        simulatedScopes.add(s.id);
        break;
      }
      p = graph.scopes[p]?.parentScopeId;
    }
  }
  for (const s of simulatedScopes) {
    for (const n of analysableNodes(graph, s)) if (n.kind === 'activity' || n.kind === 'subProcess') statsFor(n);
  }

  const gatewayDecisions: Record<string, Record<string, number>> = {};
  const linkCatches = new Map<string, GraphNode[]>();
  for (const s of simulatedScopes) {
    const nodes = analysableNodes(graph, s);
    for (const n of nodes) {
      if (n.kind === 'intermediateThrow' && n.eventDefinition === 'link') {
        const name = n.eventRef ?? n.name;
        linkCatches.set(n.id, nodes.filter((c) => c.kind === 'intermediateCatch' && c.eventDefinition === 'link' && (c.eventRef ?? c.name) === name));
      }
    }
  }

  // OR-join upstream node sets: join -> incoming flow -> nodes that can still feed that flow
  const orUpstream = new Map<string, Map<string, Set<string>>>();
  const upstreamOf = (join: GraphNode, flowId: string): Set<string> => {
    let perJoin = orUpstream.get(join.id);
    if (!perJoin) {
      perJoin = new Map();
      orUpstream.set(join.id, perJoin);
    }
    let set = perJoin.get(flowId);
    if (set) return set;
    set = new Set<string>();
    const stack = [graph.flows[flowId].sourceId];
    while (stack.length) {
      const id = stack.pop()!;
      if (id === join.id || set.has(id)) continue;
      set.add(id);
      const n = graph.nodes[id];
      if (!n) continue;
      for (const f of n.incoming) stack.push(graph.flows[f].sourceId);
      if (n.kind === 'boundary' && n.attachedTo) stack.push(n.attachedTo);
    }
    perJoin.set(flowId, set);
    return set;
  };

  // ---- measurement -----------------------------------------------------------
  const wip = new TimeWeighted();
  const cases: CaseState[] = [];
  let casesGenerated = 0;
  let completedCount = 0;
  const timeline: TimelinePoint[] = [{ t: 0, wip: 0, completed: 0 }];
  const pendingOrScopes = new Set<ScopeInst>();

  const endWarmUp = () => {
    if (warmUpDone) return;
    warmUpDone = true;
    warmUpEnd = now;
    wip.reset(now);
    for (const p of poolStates.values()) {
      p.busyCount.reset(now);
      p.available.reset(now);
      p.overtime.reset(now);
      p.queueLen.reset(now);
    }
    for (const s of activityStats.values()) s.queue.reset(now);
    log('warm-up-end');
  };
  if (config.warmUp.kind === 'time') queue.push(Math.max(0, config.warmUp.duration), { type: 'warmUpEnd' }, -2);

  const caseRng = (c: CaseState, key: string): Rng => {
    let s = c.streams.get(key);
    if (!s) {
      s = new Xoshiro128(streamSeed(config.seed, replication, `case${c.id}:${key}`));
      c.streams.set(key, s);
    }
    return s;
  };
  const draw = (c: CaseState, key: string, d: Distribution) => sample(d, caseRng(c, key));

  // ---- token bookkeeping -----------------------------------------------------
  const addHeld = (scope: ScopeInst, nodeId: string, delta: number) => {
    const v = (scope.held.get(nodeId) ?? 0) + delta;
    if (v <= 0) scope.held.delete(nodeId);
    else scope.held.set(nodeId, v);
  };

  const produce = (scope: ScopeInst, flowIds: string[]) => {
    if (scope.done) return;
    for (const f of flowIds) {
      addHeld(scope, graph.flows[f].targetId, 1);
      scope.alive++;
    }
    for (const f of flowIds) {
      if (scope.done) return;
      arrive(scope, graph.nodes[graph.flows[f].targetId], f);
    }
  };

  const consume = (scope: ScopeInst, nodeId: string, n = 1) => {
    addHeld(scope, nodeId, -n);
    scope.alive -= n;
  };

  const newScope = (scopeId: string, caseState: CaseState, parent?: ScopeInst, host?: ActivityInst): ScopeInst => {
    const s: ScopeInst = {
      scopeId,
      caseState,
      parent,
      host,
      alive: 0,
      held: new Map(),
      joins: new Map(),
      activities: new Set(),
      waits: new Set(),
      children: new Set(),
      done: false
    };
    parent?.children.add(s);
    return s;
  };

  const entryOf = (scopeId: string, preferred?: string): { start?: GraphNode; implicit: GraphNode[] } => {
    const nodes = analysableNodes(graph, scopeId);
    if (preferred && graph.nodes[preferred]?.scopeId === scopeId) return { start: graph.nodes[preferred], implicit: [] };
    const starts = nodes.filter((n) => n.kind === 'start');
    const start = starts.find((s) => !s.eventDefinition || s.eventDefinition === 'none') ?? starts[0];
    if (start) return { start, implicit: [] };
    return { implicit: nodes.filter((n) => n.incoming.length === 0 && n.kind !== 'boundary' && !(n.kind === 'intermediateCatch' && n.eventDefinition === 'link')) };
  };

  const startScope = (scope: ScopeInst, preferredStart?: string) => {
    const { start, implicit } = entryOf(scope.scopeId, preferredStart);
    if (start) {
      log('event', scope.caseState.id, start.id, 'start');
      produce(scope, start.outgoing);
    } else {
      for (const n of implicit) {
        addHeld(scope, n.id, 1);
        scope.alive++;
      }
      for (const n of implicit) arrive(scope, n, undefined);
    }
    checkScopeDone(scope);
  };

  // ---- node semantics ----------------------------------------------------------
  function arrive(scope: ScopeInst, node: GraphNode, viaFlow: string | undefined, forcedDelay?: number) {
    const c = scope.caseState;
    switch (node.kind) {
      case 'end': {
        consume(scope, node.id);
        log('event', c.id, node.id, node.eventDefinition && node.eventDefinition !== 'none' ? `${node.eventDefinition} end` : 'end');
        if (node.eventDefinition === 'terminate') {
          cancelScopeContent(scope);
          scope.alive = 0;
          scope.held.clear();
        } else if (node.eventDefinition === 'error' || node.eventDefinition === 'escalation') {
          const outcome = throwToHost(scope, node);
          if (outcome === 'interrupted') return;
          if (!outcome && !scope.parent && node.eventDefinition === 'error') c.failed = true;
        }
        checkScopeDone(scope);
        return;
      }
      case 'gateway':
        return arriveGateway(scope, node, viaFlow);
      case 'intermediateCatch': {
        let delay = forcedDelay;
        if (delay === undefined) {
          const cfg = config.events[node.id]?.delay;
          if (cfg) delay = draw(c, `evt:${node.id}`, cfg);
          else delay = node.eventDefinition === 'timer' ? parseIsoDurationMinutes(node.timerExpression) ?? 0 : 0;
        }
        const ev = queue.push(now + delay, { type: 'waitDone', scope, node });
        scope.waits.add(ev);
        return;
      }
      case 'intermediateThrow': {
        consume(scope, node.id);
        log('event', c.id, node.id, node.eventDefinition ?? 'none');
        if (node.eventDefinition === 'link') {
          const targets = linkCatches.get(node.id) ?? [];
          produce(scope, targets.flatMap((t) => t.outgoing));
        } else {
          if (node.eventDefinition === 'escalation' || node.eventDefinition === 'error') {
            if (throwToHost(scope, node) === 'interrupted') return;
          }
          produce(scope, node.outgoing);
        }
        checkScopeDone(scope);
        return;
      }
      case 'activity':
      case 'subProcess':
        startActivity(scope, node, forcedDelay);
        return;
      case 'start':
      case 'boundary':
      default:
        consume(scope, node.id);
        produce(scope, node.outgoing);
        checkScopeDone(scope);
    }
  }

  function arriveGateway(scope: ScopeInst, node: GraphNode, viaFlow: string | undefined) {
    const c = scope.caseState;
    const ins = node.incoming;
    const isJoin = ins.length > 1;

    if (node.gateway === 'parallel') {
      if (isJoin && viaFlow) {
        const buf = scope.joins.get(node.id) ?? new Map<string, number>();
        scope.joins.set(node.id, buf);
        buf.set(viaFlow, (buf.get(viaFlow) ?? 0) + 1);
        if (!ins.every((f) => (buf.get(f) ?? 0) > 0)) return;
        for (const f of ins) buf.set(f, buf.get(f)! - 1);
        consume(scope, node.id, ins.length);
      } else {
        consume(scope, node.id);
      }
      produce(scope, node.outgoing);
      checkScopeDone(scope);
      return;
    }

    if (node.gateway === 'inclusive' && isJoin && viaFlow) {
      const buf = scope.joins.get(node.id) ?? new Map<string, number>();
      scope.joins.set(node.id, buf);
      buf.set(viaFlow, (buf.get(viaFlow) ?? 0) + 1);
      pendingOrScopes.add(scope);
      checkOrJoins(scope);
      return;
    }

    consume(scope, node.id);
    routeSplit(scope, node, c);
    checkScopeDone(scope);
  }

  function routeSplit(scope: ScopeInst, node: GraphNode, c: CaseState) {
    const outs = node.outgoing;
    if (outs.length === 0) return;
    if (outs.length === 1 && node.gateway !== 'eventBased') {
      produce(scope, outs);
      return;
    }
    const probs = config.gateways[node.id]?.probabilities ?? {};
    const record = (f: string) => {
      const d = (gatewayDecisions[node.id] ??= {});
      if (c.measured) d[f] = (d[f] ?? 0) + 1;
      log('decision', c.id, node.id, f);
    };
    if (node.gateway === 'inclusive') {
      const rng = caseRng(c, `gw:${node.id}`);
      const chosen = outs.filter((f) => !graph.flows[f].isDefault && rng.next() < (probs[f] ?? 0.5));
      let selected = chosen;
      if (selected.length === 0) {
        const def = outs.find((f) => graph.flows[f].isDefault);
        selected = [def ?? outs.reduce((a, b) => ((probs[b] ?? 0) > (probs[a] ?? 0) ? b : a))];
      }
      selected.forEach(record);
      produce(scope, selected);
      return;
    }
    if (node.gateway === 'eventBased') {
      const weights = outs.map((f) => probs[f] ?? 0);
      const total = weights.reduce((a, b) => a + b, 0);
      if (total > 0) {
        const f = pickWeighted(outs, weights, caseRng(c, `gw:${node.id}`));
        record(f);
        produce(scope, [f]);
        return;
      }
      // race: the event that occurs first wins
      let best: { flow: string; delay: number } | null = null;
      for (const f of outs) {
        const target = graph.nodes[graph.flows[f].targetId];
        const delay = waitingTimeOf(target, c);
        if (!best || delay < best.delay) best = { flow: f, delay };
      }
      record(best!.flow);
      const target = graph.nodes[graph.flows[best!.flow].targetId];
      addHeld(scope, target.id, 1);
      scope.alive++;
      arrive(scope, target, best!.flow, best!.delay);
      return;
    }
    // exclusive (and complex, which is blocked by the support check)
    const weights = outs.map((f) => probs[f] ?? (Object.keys(probs).length ? 0 : 1));
    const f = pickWeighted(outs, weights, caseRng(c, `gw:${node.id}`));
    record(f);
    produce(scope, [f]);
  }

  function waitingTimeOf(target: GraphNode, c: CaseState): number {
    if (target.kind === 'intermediateCatch') {
      const cfg = config.events[target.id]?.delay;
      if (cfg) return draw(c, `evt:${target.id}`, cfg);
      return target.eventDefinition === 'timer' ? parseIsoDurationMinutes(target.timerExpression) ?? 0 : 0;
    }
    if (target.kind === 'activity') {
      const cfg = config.activities[target.id] ?? DEFAULT_ACTIVITY;
      return draw(c, `dur:${target.id}`, cfg.duration);
    }
    return 0;
  }

  function checkOrJoins(scope: ScopeInst) {
    if (scope.done) {
      pendingOrScopes.delete(scope);
      return;
    }
    let pending = false;
    for (const [joinId, buf] of scope.joins) {
      const join = graph.nodes[joinId];
      if (join.gateway !== 'inclusive') continue;
      const marked = join.incoming.filter((f) => (buf.get(f) ?? 0) > 0);
      if (marked.length === 0) continue;
      const waiting = join.incoming.some((f) => {
        if ((buf.get(f) ?? 0) > 0) return false;
        const up = upstreamOf(join, f);
        for (const [heldAt, count] of scope.held) {
          if (count > 0 && heldAt !== joinId && up.has(heldAt)) return true;
        }
        return false;
      });
      if (waiting) {
        pending = true;
        continue;
      }
      for (const f of marked) buf.set(f, buf.get(f)! - 1);
      consume(scope, joinId, marked.length);
      routeSplit(scope, join, scope.caseState);
      checkScopeDone(scope);
      // state changed; re-evaluate from scratch
      checkOrJoins(scope);
      return;
    }
    if (!pending) pendingOrScopes.delete(scope);
  }

  /** Error/escalation thrown inside a sub-process: trigger a matching boundary event on the host. */
  function throwToHost(scope: ScopeInst, node: GraphNode): 'interrupted' | 'continued' | false {
    const host = scope.host;
    if (!host || host.state !== 'active') return false;
    const kind = node.eventDefinition;
    const candidates = host.node.boundaryEvents.map((id) => graph.nodes[id]).filter((b) => b.eventDefinition === kind);
    const boundary = candidates.find((b) => b.eventRef && b.eventRef === node.eventRef) ?? candidates.find((b) => !b.eventRef) ?? candidates[0];
    if (!boundary) return false;
    log('boundary', scope.caseState.id, boundary.id, `${kind} thrown by ${node.id}`);
    if (boundary.interrupting !== false) {
      interruptActivity(host, boundary);
      return 'interrupted';
    }
    produce(host.scope, boundary.outgoing);
    return 'continued';
  }

  // ---- activities ------------------------------------------------------------
  function startActivity(scope: ScopeInst, node: GraphNode, forcedDuration?: number) {
    const c = scope.caseState;
    const cfg = config.activities[node.id] ?? DEFAULT_ACTIVITY;
    const hasContent = node.kind === 'subProcess' && (graph.scopes[node.id]?.nodeIds.length ?? 0) > 0 && node.type !== 'bpmn:AdHocSubProcess';
    const total = node.loop === 'parallel' || node.loop === 'sequential' ? Math.max(1, Math.round(cfg.instances ?? node.loopCardinality ?? 1)) : 1;
    const ai: ActivityInst = {
      node,
      cfg,
      scope,
      caseState: c,
      arrived: now,
      state: 'active',
      items: new Set(),
      iteration: 0,
      instancesStarted: 0,
      instancesTotal: total,
      sequential: node.loop !== 'parallel',
      timers: [],
      forcedDuration
    };
    scope.activities.add(ai);
    const st = statsFor(node);
    const execs = (c.executions.get(node.id) ?? 0) + 1;
    c.executions.set(node.id, execs);
    if (execs > 1) {
      c.rework++;
      if (c.measured) st.rework++;
    }

    // boundary events
    for (const bid of node.boundaryEvents) {
      const b = graph.nodes[bid];
      if (!b || b.eventDefinition === 'compensate') continue;
      if (b.eventDefinition === 'timer') {
        const cfgDelay = config.events[b.id]?.delay;
        const delay = cfgDelay ? draw(c, `evt:${b.id}`, cfgDelay) : parseIsoDurationMinutes(b.timerExpression);
        if (delay !== null && delay !== undefined) ai.timers.push(queue.push(now + delay, { type: 'boundaryTimer', ai, boundary: b }, -0.5));
      } else if (!ai.boundaryOutcome) {
        const p = config.events[b.id]?.probability ?? 0;
        if (p > 0 && caseRng(c, `bnd:${b.id}`).next() < p) ai.boundaryOutcome = b;
      }
    }

    if (hasContent) {
      ai.child = newScope(node.id, c, scope, ai);
      startScope(ai.child);
      return;
    }
    if (ai.sequential) startNextItem(ai);
    else for (let i = 0; i < total; i++) startNextItem(ai);
  }

  let itemSeq = 0;
  function startNextItem(ai: ActivityInst) {
    if (ai.state !== 'active' || ai.scope.done) return;
    ai.instancesStarted++;
    ai.iteration++;
    const item: WorkItem = { ai, enqueued: now, seq: itemSeq++, done: false };
    ai.items.add(item);
    const poolId = ai.cfg.resourcePoolId;
    const pool = poolId ? poolStates.get(poolId) : undefined;
    if (!pool) {
      beginWork(item);
      return;
    }
    item.pool = pool;
    const free = freeWorker(pool);
    if (free >= 0 && pool.queue.length === 0) {
      seize(pool, free, item);
      beginWork(item);
      return;
    }
    // queue capacity per activity
    const st = statsFor(ai.node);
    if (ai.cfg.queueCapacity !== null && ai.cfg.queueCapacity !== undefined && st.waitingNow >= ai.cfg.queueCapacity) {
      if (ai.caseState.measured) st.rejected++;
      log('reject', ai.caseState.id, ai.node.id, 'queue full');
      ai.items.delete(item);
      rejectCase(ai.caseState);
      return;
    }
    pool.queue.push(item);
    pool.queueLen.set(now, pool.queue.length);
    st.waitingNow++;
    st.queue.set(now, st.waitingNow);
    log('enqueue', ai.caseState.id, ai.node.id, pool.cfg.name);
  }

  function freeWorker(pool: PoolState): number {
    if (!pool.open) return -1;
    return pool.busy.indexOf(false);
  }

  function seize(pool: PoolState, worker: number, item: WorkItem) {
    pool.busy[worker] = true;
    item.worker = worker;
    const busy = pool.busy.filter(Boolean).length;
    pool.busyCount.set(now, busy);
    pool.overtime.set(now, pool.open ? 0 : busy);
  }

  function release(pool: PoolState, worker: number) {
    pool.busy[worker] = false;
    const busy = pool.busy.filter(Boolean).length;
    pool.busyCount.set(now, busy);
    pool.overtime.set(now, pool.open ? 0 : busy);
  }

  function dispatch(pool: PoolState) {
    while (pool.queue.length > 0) {
      const w = freeWorker(pool);
      if (w < 0) return;
      let idx = 0;
      if (pool.cfg.discipline === 'PRIORITY') {
        for (let i = 1; i < pool.queue.length; i++) {
          const a = pool.queue[i];
          const b = pool.queue[idx];
          if (a.ai.caseState.priority > b.ai.caseState.priority || (a.ai.caseState.priority === b.ai.caseState.priority && a.seq < b.seq)) idx = i;
        }
      }
      const [item] = pool.queue.splice(idx, 1);
      pool.queueLen.set(now, pool.queue.length);
      const st = statsFor(item.ai.node);
      st.waitingNow--;
      st.queue.set(now, st.waitingNow);
      seize(pool, w, item);
      beginWork(item);
    }
  }

  function beginWork(item: WorkItem) {
    const ai = item.ai;
    const c = ai.caseState;
    item.started = now;
    const waited = now - item.enqueued;
    c.waiting += waited;
    c.cost += (waited / 60) * config.costs.waitingCostPerHour;
    const st = statsFor(ai.node);
    if (c.measured) st.waiting.push(waited);
    let duration: number;
    if (ai.forcedDuration !== undefined && ai.instancesStarted === 1 && ai.iteration === 1) duration = ai.forcedDuration;
    else duration = draw(c, `dur:${ai.node.id}`, ai.cfg.duration);
    item.duration = duration;
    log('start', c.id, ai.node.id, item.pool ? `${item.pool.cfg.name} #${(item.worker ?? 0) + 1}` : undefined);
    item.completion = queue.push(now + duration, { type: 'workDone', item });
  }

  function accountWork(item: WorkItem, status: 'complete' | 'cancelled') {
    const ai = item.ai;
    const c = ai.caseState;
    const worked = now - (item.started ?? now);
    const labor = item.pool ? (worked / 60) * item.pool.cfg.costPerHour : 0;
    const fixed = status === 'complete' ? ai.cfg.fixedCost : 0;
    c.processing += worked;
    c.cost += labor + fixed;
    const st = statsFor(ai.node);
    if (c.measured) {
      if (status === 'complete') {
        st.executions++;
        st.processing.push(worked);
      } else st.cancelled++;
      st.cost += labor + fixed;
      if (item.pool) item.pool.cost += labor;
    }
    if (collectLog && eventLog.length < eventLogLimit && item.started !== undefined) {
      eventLog.push({
        caseId: c.id,
        activityId: ai.node.id,
        activity: ai.node.name || ai.node.id,
        resource: item.pool ? `${item.pool.cfg.name} ${(item.worker ?? 0) + 1}` : 'system',
        enqueued: item.enqueued,
        start: item.started,
        end: now,
        status,
        cost: labor + fixed
      });
    }
  }

  function onWorkDone(item: WorkItem) {
    const ai = item.ai;
    if (item.done || ai.state !== 'active') return;
    item.done = true;
    ai.items.delete(item);
    accountWork(item, 'complete');
    log('complete', ai.caseState.id, ai.node.id);
    if (item.pool && item.worker !== undefined) {
      release(item.pool, item.worker);
      dispatch(item.pool);
    }
    if (ai.state !== 'active') return;
    // more iterations / instances?
    if (ai.node.loop === 'standard') {
      const p = ai.cfg.repeatProbability ?? 0;
      const max = ai.cfg.maxIterations ?? 10;
      if (ai.iteration < max && caseRng(ai.caseState, `loop:${ai.node.id}`).next() < p) {
        ai.caseState.rework++;
        statsFor(ai.node).rework += ai.caseState.measured ? 1 : 0;
        startNextItem(ai);
        return;
      }
    } else if (ai.instancesTotal > 1) {
      if (ai.sequential && ai.instancesStarted < ai.instancesTotal) {
        startNextItem(ai);
        return;
      }
      if (ai.items.size > 0) return;
    }
    finishActivity(ai);
  }

  function finishActivity(ai: ActivityInst) {
    if (ai.state !== 'active') return;
    ai.state = 'done';
    cancelTimers(ai);
    const scope = ai.scope;
    scope.activities.delete(ai);
    if (ai.child) scope.children.delete(ai.child);
    const c = ai.caseState;
    c.path.push(ai.node.name || ai.node.id);
    consume(scope, ai.node.id);
    const b = ai.boundaryOutcome;
    if (b) {
      log('boundary', c.id, b.id, `${b.eventDefinition} on ${ai.node.id}`);
      if (b.interrupting !== false) {
        produce(scope, b.outgoing);
        checkScopeDone(scope);
        return;
      }
      produce(scope, b.outgoing);
    }
    produce(scope, normalOutgoing(ai.node, c));
    checkScopeDone(scope);
    if (pendingOrScopes.has(scope)) checkOrJoins(scope);
  }

  function normalOutgoing(node: GraphNode, c: CaseState): string[] {
    const flows = node.outgoing.map((f) => graph.flows[f]);
    const conditional = flows.filter((f) => f.condition && !f.isDefault);
    if (conditional.length === 0) return node.outgoing;
    const rng = caseRng(c, `cond:${node.id}`);
    const taken = flows.filter((f) => !f.condition && !f.isDefault).map((f) => f.id);
    const chosen = conditional.filter(() => rng.next() < 0.5).map((f) => f.id);
    const def = flows.find((f) => f.isDefault);
    if (chosen.length === 0 && def) taken.push(def.id);
    return [...taken, ...chosen];
  }

  function cancelTimers(ai: ActivityInst) {
    for (const t of ai.timers) t.cancelled = true;
    ai.timers = [];
  }

  function cancelActivityInstance(ai: ActivityInst) {
    if (ai.state !== 'active') return;
    ai.state = 'cancelled';
    cancelTimers(ai);
    for (const item of ai.items) {
      item.done = true;
      if (item.started !== undefined) {
        item.completion && (item.completion.cancelled = true);
        accountWork(item, 'cancelled');
        if (item.pool && item.worker !== undefined) {
          release(item.pool, item.worker);
          dispatch(item.pool);
        }
      } else if (item.pool) {
        const idx = item.pool.queue.indexOf(item);
        if (idx >= 0) {
          item.pool.queue.splice(idx, 1);
          item.pool.queueLen.set(now, item.pool.queue.length);
          const st = statsFor(ai.node);
          st.waitingNow--;
          st.queue.set(now, st.waitingNow);
        }
      }
    }
    ai.items.clear();
    if (ai.child) {
      cancelScopeContent(ai.child);
      ai.child.done = true;
      ai.scope.children.delete(ai.child);
    }
    ai.scope.activities.delete(ai);
    log('cancel', ai.caseState.id, ai.node.id);
  }

  function interruptActivity(ai: ActivityInst, boundary: GraphNode) {
    if (ai.state !== 'active') return;
    cancelActivityInstance(ai);
    const scope = ai.scope;
    ai.caseState.path.push(`${ai.node.name || ai.node.id} ⚡`);
    consume(scope, ai.node.id);
    produce(scope, boundary.outgoing);
    checkScopeDone(scope);
    if (pendingOrScopes.has(scope)) checkOrJoins(scope);
  }

  function cancelScopeContent(scope: ScopeInst) {
    for (const ai of [...scope.activities]) cancelActivityInstance(ai);
    for (const w of scope.waits) w.cancelled = true;
    scope.waits.clear();
    for (const child of [...scope.children]) {
      cancelScopeContent(child);
      child.done = true;
    }
    scope.children.clear();
    scope.joins.clear();
    pendingOrScopes.delete(scope);
  }

  function checkScopeDone(scope: ScopeInst) {
    if (scope.done || scope.alive > 0) return;
    scope.done = true;
    pendingOrScopes.delete(scope);
    if (scope.host) {
      const host = scope.host;
      if (host.state === 'active') finishActivity(host);
      return;
    }
    completeCase(scope.caseState);
  }

  function rejectCase(c: CaseState) {
    if (c.rejected || c.completed !== undefined) return;
    c.rejected = true;
    if (c.root) {
      cancelScopeContent(c.root);
      c.root.done = true;
    }
    c.completed = now;
    wip.add(now, -1);
    c.streams.clear();
  }

  function completeCase(c: CaseState) {
    if (c.completed !== undefined) return;
    c.completed = now;
    completedCount++;
    wip.add(now, -1);
    log('case-complete', c.id, undefined, c.failed ? 'failed' : undefined);
    timeline.push({ t: now, wip: wip.current, completed: completedCount });
    c.streams.clear();
  }

  // ---- arrivals ---------------------------------------------------------------
  const arrivalRng = streams.stream('arrival');
  const batchRng = streams.stream('batch');
  const priorityRng = streams.stream('priority');
  const interArrival = (): number => {
    const a = config.arrival;
    if (a.kind === 'fixed') return a.interval;
    if (a.kind === 'poisson') return sample({ type: 'exponential', mean: a.interval }, arrivalRng);
    return sample(a.distribution ?? { type: 'constant', value: a.interval }, arrivalRng);
  };
  const pickPriority = (): number => {
    const ps = config.priorities;
    if (!ps.length) return 0;
    return ps[Math.min(ps.length - 1, pickIndex(ps.map((p) => p.probability), priorityRng))].value;
  };

  const createCase = () => {
    const index = casesGenerated++;
    const measured =
      config.warmUp.kind === 'cases' ? index >= config.warmUp.count : config.warmUp.kind === 'time' ? now >= config.warmUp.duration : true;
    if (measured && config.warmUp.kind === 'cases' && !warmUpDone) endWarmUp();
    const c: CaseState = {
      id: index + 1,
      arrival: now,
      priority: pickPriority(),
      measured,
      rejected: false,
      failed: false,
      processing: 0,
      waiting: 0,
      cost: 0,
      path: [],
      executions: new Map(),
      rework: 0,
      streams: new Map()
    };
    cases.push(c);
    wip.add(now, 1);
    log('arrival', c.id);
    timeline.push({ t: now, wip: wip.current, completed: completedCount });
    c.root = newScope(processId, c);
    startScope(c.root, config.arrival.startEventId);
  };

  queue.push(0, { type: 'arrival' }, 1);


  // ---- main loop -------------------------------------------------------------
  let events = 0;
  let stoppedBy: ReplicationResult['stoppedBy'] = 'completed';
  for (;;) {
    const next = queue.pop();
    if (!next) break;
    if (next.cancelled) continue;
    if (next.time > config.maxSimulationTime) {
      stoppedBy = 'max-time';
      now = config.maxSimulationTime;
      break;
    }
    if (++events > maxEvents) {
      stoppedBy = 'max-events';
      break;
    }
    now = next.time;
    const ev = next.payload;
    if (ev.type !== 'shift') lastWorkTime = now;
    else shiftEventsQueued--;
    switch (ev.type) {
      case 'arrival': {
        const batch = config.arrival.batchSize ? Math.max(1, Math.round(sample(config.arrival.batchSize, batchRng))) : 1;
        for (let i = 0; i < batch && casesGenerated < config.numberOfCases; i++) createCase();
        if (casesGenerated < config.numberOfCases) queue.push(now + interArrival(), { type: 'arrival' }, 1);
        break;
      }
      case 'workDone':
        onWorkDone(ev.item);
        break;
      case 'waitDone': {
        const { scope, node } = ev;
        scope.waits.delete(next);
        if (scope.done) break;
        consume(scope, node.id);
        log('event', scope.caseState.id, node.id, node.eventDefinition);
        produce(scope, node.outgoing);
        checkScopeDone(scope);
        if (pendingOrScopes.has(scope)) checkOrJoins(scope);
        break;
      }
      case 'boundaryTimer': {
        const { ai, boundary } = ev;
        if (ai.state !== 'active') break;
        log('boundary', ai.caseState.id, boundary.id, `timer on ${ai.node.id}`);
        if (boundary.interrupting !== false) interruptActivity(ai, boundary);
        else {
          produce(ai.scope, boundary.outgoing);
          checkScopeDone(ai.scope);
        }
        break;
      }
      case 'shift': {
        const pool = ev.pool;
        pool.open = pool.calendar!.isOpen(now + 1e-9);
        pool.available.set(now, pool.open ? pool.busy.length : 0);
        const busy = pool.busy.filter(Boolean).length;
        pool.overtime.set(now, pool.open ? 0 : busy);
        log('shift', undefined, undefined, `${pool.cfg.name} ${pool.open ? 'opens' : 'closes'}`);
        if (pool.open) dispatch(pool);
        // keep shift events going only while work can still arrive or wait
        const hasWork =
          casesGenerated < config.numberOfCases ||
          queue.size - shiftEventsQueued > 0 ||
          [...poolStates.values()].some((p) => p.queue.length > 0 || p.busy.some(Boolean));
        const nextChange = pool.calendar!.nextChange(now);
        if (hasWork && Number.isFinite(nextChange)) {
          queue.push(nextChange, { type: 'shift', pool }, -1);
          shiftEventsQueued++;
        }
        break;
      }
      case 'warmUpEnd':
        endWarmUp();
        break;
    }
    // OR-joins may become enabled after any state change in their scope
    if (pendingOrScopes.size) for (const s of [...pendingOrScopes]) checkOrJoins(s);
  }

  // ---- results -----------------------------------------------------------------
  const endTime = stoppedBy === 'completed' ? lastWorkTime : now;
  if (!warmUpDone) endWarmUp();
  const measured = cases.filter((c) => c.measured);
  const completed = measured.filter((c) => c.completed !== undefined && !c.rejected);
  const cycle = completed.map((c) => c.completed! - c.arrival);
  const processing = completed.map((c) => c.processing);
  const waiting = completed.map((c) => c.waiting);
  const costs = completed.map((c) => c.cost);
  const window = Math.max(0, endTime - warmUpEnd);
  const slaTarget = config.sla?.cycleTimeTarget;

  const activities: Record<string, ActivityResult> = {};
  for (const [id, s] of activityStats) {
    activities[id] = {
      id,
      name: s.node.name || id,
      type: s.node.type,
      executions: s.executions,
      reworkExecutions: s.rework,
      cancelled: s.cancelled,
      rejected: s.rejected,
      processing: summarize(s.processing),
      waiting: summarize(s.waiting),
      queueLengthAvg: s.queue.average(endTime),
      queueLengthMax: s.queue.maxValue,
      cost: s.cost
    };
  }

  const pools: Record<string, PoolResult> = {};
  for (const [id, p] of poolStates) {
    const busy = p.busyCount.integral(endTime);
    const overtime = p.overtime.integral(endTime);
    const available = p.available.integral(endTime);
    pools[id] = {
      id,
      name: p.cfg.name,
      capacity: p.busy.length,
      utilization: available > 0 ? Math.min(1, (busy - overtime) / available) : 0,
      busyTime: busy,
      availableTime: available,
      overtime,
      queueLengthAvg: p.queueLen.average(endTime),
      queueLengthMax: p.queueLen.maxValue,
      cost: p.cost
    };
  }

  const variantCounts = new Map<string, PathVariant>();
  for (const c of completed) {
    const key = c.path.join('\u0000');
    const v = variantCounts.get(key);
    if (v) v.count++;
    else variantCounts.set(key, { path: c.path, count: 1 });
  }
  const paths = [...variantCounts.values()].sort((a, b) => b.count - a.count).slice(0, 25);

  const incompleteMap = new Map<string, number>();
  const collectHeld = (s: ScopeInst) => {
    for (const [nodeId, count] of s.held) incompleteMap.set(nodeId, (incompleteMap.get(nodeId) ?? 0) + count);
    for (const ch of s.children) collectHeld(ch);
  };
  for (const c of measured) if (c.completed === undefined && c.root) collectHeld(c.root);

  timeline.push({ t: endTime, wip: wip.current, completed: completedCount });

  return {
    replication,
    seed: config.seed,
    warmUpEnd,
    endTime,
    eventsProcessed: events,
    stoppedBy,
    cases: {
      generated: casesGenerated,
      measured: measured.length,
      completed: completed.length,
      incomplete: measured.filter((c) => c.completed === undefined).length,
      rejected: measured.filter((c) => c.rejected).length,
      failed: completed.filter((c) => c.failed).length
    },
    kpis: {
      cycleTime: summarize(cycle),
      processingTime: summarize(processing),
      waitingTime: summarize(waiting),
      costPerCase: summarize(costs),
      throughputPerHour: window > 0 ? (completed.length / window) * 60 : 0,
      wipAvg: wip.average(endTime),
      wipMax: wip.maxValue,
      slaCompliance: slaTarget !== undefined && completed.length ? cycle.filter((x) => x <= slaTarget).length / completed.length : null,
      totalCost: costs.reduce((a, b) => a + b, 0),
      reworkRate: completed.length ? completed.filter((c) => c.rework > 0).length / completed.length : 0
    },
    activities,
    pools,
    gatewayDecisions,
    paths,
    incomplete: [...incompleteMap.entries()].map(([elementId, count]) => ({ elementId, count })).sort((a, b) => b.count - a.count),
    samples: {
      cycleTimes: thin(cycle, sampleLimit),
      waitingTimes: thin(waiting, sampleLimit),
      processingTimes: thin(processing, sampleLimit)
    },
    timeline: thin(timeline, 600),
    trace,
    eventLog
  };
}

function pickIndex(weights: number[], rng: Rng): number {
  const total = weights.reduce((a, w) => a + Math.max(0, w), 0);
  if (total <= 0) return Math.floor(rng.next() * weights.length);
  let u = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    u -= Math.max(0, weights[i]);
    if (u < 0) return i;
  }
  return weights.length - 1;
}

function pickWeighted<T>(items: T[], weights: number[], rng: Rng): T {
  return items[pickIndex(weights, rng)];
}
