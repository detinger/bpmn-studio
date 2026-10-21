/**
 * Behavioral (control-flow) analysis of BPMN process scopes.
 *
 * The analysis explores the reachable state space of a token game over the
 * sequence flows of one process scope. It is a formal analysis for the
 * supported subset described in docs/simulation-semantics/behavioral-analysis.md:
 *
 *  - Tokens live on sequence flows (plus one virtual entry place per start node).
 *  - Activities, events and exclusive/event-based gateways consume one token
 *    from one incoming flow (uncontrolled merge).
 *  - Activities and events without a gateway produce a token on every
 *    unconditional outgoing flow (implicit parallel split) and on any subset of
 *    conditional outgoing flows (implicit inclusive split, default flow if none).
 *  - Exclusive and event-based gateways produce exactly one token on one
 *    outgoing flow (non-deterministic choice: all alternatives are explored).
 *  - Parallel gateways wait for a token on every incoming flow and produce a
 *    token on every outgoing flow.
 *  - Inclusive gateways produce tokens on any non-empty subset of outgoing
 *    flows. As joins they fire once no further token can arrive on an empty
 *    incoming flow (standard non-local OR-join approximation).
 *  - Sub-processes are treated as atomic activities and analysed separately.
 *  - Boundary events are alternative completions of their host activity.
 *  - Terminate end events consume all tokens of the scope.
 *
 * Complex gateways are approximated as inclusive gateways and the result is
 * flagged as approximate. Event sub-processes, compensation handlers and
 * message-flow coordination between pools are not part of this analysis.
 */
import type { GraphNode, ProcessGraph } from './graph';

export interface AnalysisOptions {
  /** Upper bound on explored states per scope. */
  maxStates?: number;
  /** A flow holding more tokens than this marks the state as unbounded. */
  maxTokensPerFlow?: number;
  /** Maximum number of subset alternatives per inclusive split (2^n - 1). */
  maxSubsetBranches?: number;
}

export interface TraceStep {
  nodeId: string;
  /** Flows that received a token when the node fired. */
  produced: string[];
  /** Boundary event that completed the node, if any. */
  boundaryId?: string;
}

export interface StuckToken {
  flowId: string;
  targetId: string;
  /** Incoming flows of the waiting join that never receive a token. */
  missingFlows: string[];
}

export interface DeadlockFinding {
  stuck: StuckToken[];
  trace: TraceStep[];
}

export interface UnsafeFinding {
  flowId: string;
  count: number;
  trace: TraceStep[];
}

export interface LivelockFinding {
  trace: TraceStep[];
  /** Nodes that keep firing without the possibility to complete. */
  loopNodeIds: string[];
}

export interface ScopeAnalysis {
  scopeId: string;
  /** False when the state space was truncated by `maxStates`. */
  complete: boolean;
  approximations: string[];
  stateCount: number;
  edgeCount: number;
  deadlocks: DeadlockFinding[];
  unsafe: UnsafeFinding[];
  livelocks: LivelockFinding[];
  unbounded: UnsafeFinding[];
  /** Nodes that never fire in any reachable state. */
  deadNodeIds: string[];
  firedNodeIds: string[];
  /** Nodes that participate in the analysis (excludes event sub-processes etc.). */
  analysedNodeIds: string[];
  canComplete: boolean;
  sound: boolean;
}

export interface ModelAnalysis {
  scopes: ScopeAnalysis[];
  sound: boolean;
  complete: boolean;
}

interface Transition {
  nodeId: string;
  consume: number[];
  produce: number[];
  terminate?: boolean;
  boundaryId?: string;
}

export interface StateEdge {
  to: number;
  nodeId: string;
  produced: number[];
  boundaryId?: string;
}

/** Explicit state graph, exposed for assessment queries. */
export interface StateGraph {
  scopeId: string;
  places: string[];
  states: Uint8Array[];
  edges: StateEdge[][];
  initial: number[];
  finals: Set<number>;
  dead: Set<number>;
  /** States not expanded because of the token bound or the state limit. */
  cut: Set<number>;
  parent: Array<{ from: number; edge: StateEdge } | null>;
  truncated: boolean;
  approximations: string[];
  nodeIds: string[];
}

const DEFAULTS: Required<AnalysisOptions> = {
  maxStates: 20000,
  maxTokensPerFlow: 3,
  maxSubsetBranches: 63
};

function isEventSubProcess(n: GraphNode) {
  return n.kind === 'subProcess' && n.triggeredByEvent;
}

/** Nodes of a scope that take part in the normal control flow. */
export function analysableNodes(graph: ProcessGraph, scopeId: string): GraphNode[] {
  const scope = graph.scopes[scopeId];
  if (!scope) return [];
  return scope.nodeIds
    .map((id) => graph.nodes[id])
    .filter((n) => n && !isEventSubProcess(n) && !n.isForCompensation && !(n.kind === 'boundary' && n.eventDefinition === 'compensate'));
}

function entryNodes(nodes: GraphNode[]): GraphNode[] {
  const starts = nodes.filter((n) => n.kind === 'start');
  if (starts.length) return starts;
  // implicit start: every node without incoming flows (except boundary / link catch events)
  return nodes.filter(
    (n) => n.incoming.length === 0 && n.kind !== 'boundary' && !(n.kind === 'intermediateCatch' && n.eventDefinition === 'link')
  );
}

function subsets<T>(items: T[], limit: number): T[][] {
  const out: T[][] = [];
  const n = Math.min(items.length, 12);
  const total = 1 << n;
  for (let mask = 1; mask < total && out.length < limit; mask++) {
    const s: T[] = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) s.push(items[i]);
    out.push(s);
  }
  return out;
}

/**
 * Build the explicit state graph for one scope.
 * `initialEntries` selects which entry node(s) receive the initial token; by
 * default every start event gets its own initial state (separate instances),
 * and implicit start nodes all start together.
 */
export function buildStateGraph(graph: ProcessGraph, scopeId: string, options: AnalysisOptions = {}): StateGraph {
  const opts = { ...DEFAULTS, ...options };
  const nodes = analysableNodes(graph, scopeId);
  const nodeSet = new Set(nodes.map((n) => n.id));
  const approximations: string[] = [];

  const flowIds = (graph.scopes[scopeId]?.flowIds ?? []).filter((f) => {
    const fl = graph.flows[f];
    return fl && nodeSet.has(fl.sourceId) && nodeSet.has(fl.targetId);
  });
  const entries = entryNodes(nodes);
  const places = [...flowIds, ...entries.map((e) => `entry:${e.id}`)];
  const placeIndex = new Map(places.map((p, i) => [p, i]));
  const P = places.length;

  const inPlaces = (n: GraphNode): number[] => {
    const ins = n.incoming.map((f) => placeIndex.get(f)).filter((i): i is number => i !== undefined);
    const entry = placeIndex.get(`entry:${n.id}`);
    if (entry !== undefined) ins.push(entry);
    return ins;
  };
  const outPlaces = (ids: string[]) => ids.map((f) => placeIndex.get(f)).filter((i): i is number => i !== undefined);

  // link events: throw -> outgoing of matching catch(es)
  const linkTargets = new Map<string, number[]>();
  for (const n of nodes) {
    if (n.kind === 'intermediateThrow' && n.eventDefinition === 'link') {
      const name = n.eventRef ?? n.name;
      const catches = nodes.filter((c) => c.kind === 'intermediateCatch' && c.eventDefinition === 'link' && (c.eventRef ?? c.name) === name);
      linkTargets.set(n.id, catches.flatMap((c) => outPlaces(c.outgoing)));
    }
  }

  // Normal output alternatives of a node (list of produced place sets).
  const outputAlternatives = (n: GraphNode): number[][] => {
    if (n.kind === 'end') return [[]];
    if (linkTargets.has(n.id)) return [linkTargets.get(n.id)!];
    if (n.kind === 'gateway') {
      const outs = outPlaces(n.outgoing);
      if (outs.length === 0) return [[]];
      switch (n.gateway) {
        case 'parallel':
          return [outs];
        case 'exclusive':
        case 'eventBased':
          return outs.map((o) => [o]);
        case 'inclusive':
        case 'complex':
          return subsets(outs, opts.maxSubsetBranches);
      }
    }
    const unconditional: number[] = [];
    const conditional: number[] = [];
    let def: number | undefined;
    for (const f of n.outgoing) {
      const p = placeIndex.get(f);
      if (p === undefined) continue;
      const fl = graph.flows[f];
      if (fl.isDefault) def = p;
      else if (fl.condition) conditional.push(p);
      else unconditional.push(p);
    }
    if (conditional.length === 0) return [[...unconditional, ...(def !== undefined ? [def] : [])]];
    const alts: number[][] = [];
    alts.push([...unconditional, ...(def !== undefined ? [def] : [])]);
    for (const s of subsets(conditional, opts.maxSubsetBranches)) alts.push([...unconditional, ...s]);
    return alts;
  };

  // Precompute OR-join upstream reachability: for join j and incoming flow f,
  // the set of places from which a token can still reach f without passing j.
  const orUpstream = new Map<string, Map<number, Set<number>>>();
  const placeSource = (p: number): GraphNode | undefined => {
    const id = places[p];
    if (id.startsWith('entry:')) return undefined;
    return graph.nodes[graph.flows[id].sourceId];
  };
  const feeders = (n: GraphNode): number[] => {
    const res = inPlaces(n);
    if (n.kind === 'boundary' && n.attachedTo && nodeSet.has(n.attachedTo)) res.push(...inPlaces(graph.nodes[n.attachedTo]));
    if (n.kind === 'intermediateCatch' && n.eventDefinition === 'link') {
      for (const [throwId] of linkTargets) {
        const t = graph.nodes[throwId];
        if ((t.eventRef ?? t.name) === (n.eventRef ?? n.name)) res.push(...inPlaces(t));
      }
    }
    return res;
  };
  for (const n of nodes) {
    if (n.kind !== 'gateway' || (n.gateway !== 'inclusive' && n.gateway !== 'complex')) continue;
    if (n.gateway === 'complex') approximations.push(`Complex gateway "${n.name || n.id}" is analysed as an inclusive gateway.`);
    const perFlow = new Map<number, Set<number>>();
    for (const p of inPlaces(n)) {
      const seen = new Set<number>([p]);
      const stack = [p];
      while (stack.length) {
        const q = stack.pop()!;
        const src = placeSource(q);
        if (!src || src.id === n.id) continue;
        for (const r of feeders(src)) {
          if (!seen.has(r)) {
            seen.add(r);
            stack.push(r);
          }
        }
      }
      perFlow.set(p, seen);
    }
    orUpstream.set(n.id, perFlow);
  }

  const enabledTransitions = (m: Uint8Array): Transition[] => {
    const ts: Transition[] = [];
    for (const n of nodes) {
      if (n.kind === 'boundary') continue; // fired through their host
      const ins = inPlaces(n);
      if (ins.length === 0) continue;
      const marked = ins.filter((p) => m[p] > 0);
      if (marked.length === 0) continue;

      if (n.kind === 'gateway' && n.gateway === 'parallel') {
        if (marked.length !== ins.length) continue;
        for (const out of outputAlternatives(n)) ts.push({ nodeId: n.id, consume: ins, produce: out });
        continue;
      }
      if (n.kind === 'gateway' && (n.gateway === 'inclusive' || n.gateway === 'complex') && ins.length > 1) {
        const up = orUpstream.get(n.id)!;
        let waiting = false;
        for (const p of ins) {
          if (m[p] > 0) continue;
          const feeders = up.get(p)!;
          for (let q = 0; q < P; q++) {
            if (m[q] > 0 && q !== p && feeders.has(q) && !ins.includes(q)) {
              waiting = true;
              break;
            }
          }
          if (waiting) break;
        }
        if (waiting) continue;
        for (const out of outputAlternatives(n)) ts.push({ nodeId: n.id, consume: marked, produce: out });
        continue;
      }
      // uncontrolled merge: each marked incoming flow is an independent trigger
      const isTerminate = n.kind === 'end' && n.eventDefinition === 'terminate';
      const normal = outputAlternatives(n);
      const boundaries = n.boundaryEvents.map((b) => graph.nodes[b]).filter((b) => b && b.eventDefinition !== 'compensate' && nodeSet.has(b.id));
      for (const p of marked) {
        if (isTerminate) {
          ts.push({ nodeId: n.id, consume: [p], produce: [], terminate: true });
          continue;
        }
        for (const out of normal) ts.push({ nodeId: n.id, consume: [p], produce: out });
        for (const b of boundaries) {
          const bOut = outPlaces(b.outgoing);
          if (b.interrupting !== false) {
            ts.push({ nodeId: n.id, consume: [p], produce: bOut, boundaryId: b.id });
          } else {
            for (const out of normal) ts.push({ nodeId: n.id, consume: [p], produce: [...out, ...bOut], boundaryId: b.id });
          }
        }
      }
    }
    return ts;
  };

  // ---- exploration --------------------------------------------------------
  const states: Uint8Array[] = [];
  const edges: StateEdge[][] = [];
  const parent: Array<{ from: number; edge: StateEdge } | null> = [];
  const index = new Map<string, number>();
  const finals = new Set<number>();
  const dead = new Set<number>();
  const cut = new Set<number>();
  let truncated = false;

  const keyOf = (m: Uint8Array) => String.fromCharCode(...m);
  const addState = (m: Uint8Array, from: { from: number; edge: StateEdge } | null): number => {
    const k = keyOf(m);
    const existing = index.get(k);
    if (existing !== undefined) return existing;
    const i = states.length;
    states.push(m);
    edges.push([]);
    parent.push(from);
    index.set(k, i);
    return i;
  };

  const initial: number[] = [];
  const startEvents = entries.filter((e) => e.kind === 'start');
  if (startEvents.length) {
    for (const s of startEvents) {
      const m = new Uint8Array(P);
      m[placeIndex.get(`entry:${s.id}`)!] = 1;
      initial.push(addState(m, null));
    }
  } else if (entries.length) {
    const m = new Uint8Array(P);
    for (const e of entries) m[placeIndex.get(`entry:${e.id}`)!] = 1;
    initial.push(addState(m, null));
  }

  const queue = [...initial];
  let head = 0;
  while (head < queue.length) {
    const s = queue[head++];
    const m = states[s];
    let empty = true;
    let overBound = false;
    for (let p = 0; p < P; p++) {
      if (m[p] > 0) empty = false;
      if (m[p] > opts.maxTokensPerFlow) overBound = true;
    }
    if (empty) {
      finals.add(s);
      continue;
    }
    if (overBound) {
      cut.add(s);
      continue;
    }
    const ts = enabledTransitions(m);
    if (ts.length === 0) {
      dead.add(s);
      continue;
    }
    for (const t of ts) {
      let next: Uint8Array;
      if (t.terminate) {
        next = new Uint8Array(P);
      } else {
        next = m.slice();
        for (const p of t.consume) next[p] -= 1;
        for (const p of t.produce) next[p] = Math.min(255, next[p] + 1);
      }
      const before = states.length;
      if (before >= opts.maxStates && !index.has(keyOf(next))) {
        truncated = true;
        cut.add(s);
        continue;
      }
      const edge: StateEdge = { to: -1, nodeId: t.nodeId, produced: t.produce, boundaryId: t.boundaryId };
      const to = addState(next, { from: s, edge });
      edge.to = to;
      edges[s].push(edge);
      if (to === before) queue.push(to);
    }
  }

  return {
    scopeId,
    places,
    states,
    edges,
    initial,
    finals,
    dead,
    cut,
    parent,
    truncated,
    approximations,
    nodeIds: nodes.map((n) => n.id)
  };
}

export function traceTo(sg: StateGraph, state: number): TraceStep[] {
  const steps: TraceStep[] = [];
  let cur: number | null = state;
  while (cur !== null) {
    const p: { from: number; edge: StateEdge } | null = sg.parent[cur];
    if (!p) break;
    steps.push({
      nodeId: p.edge.nodeId,
      produced: p.edge.produced.map((i) => sg.places[i]).filter((x) => !x.startsWith('entry:')),
      boundaryId: p.edge.boundaryId
    });
    cur = p.from;
  }
  return steps.reverse();
}

/** States from which a final (empty) state is reachable. Cut states count as "unknown" (optimistic). */
export function statesThatCanComplete(sg: StateGraph): Set<number> {
  const reverse: number[][] = sg.states.map(() => []);
  sg.edges.forEach((es, from) => es.forEach((e) => reverse[e.to].push(from)));
  const ok = new Set<number>([...sg.finals, ...sg.cut]);
  const stack = [...ok];
  while (stack.length) {
    const s = stack.pop()!;
    for (const p of reverse[s]) {
      if (!ok.has(p)) {
        ok.add(p);
        stack.push(p);
      }
    }
  }
  return ok;
}

export function analyseScope(graph: ProcessGraph, scopeId: string, options: AnalysisOptions = {}): ScopeAnalysis {
  const opts = { ...DEFAULTS, ...options };
  const sg = buildStateGraph(graph, scopeId, opts);
  const flowCount = sg.places.filter((p) => !p.startsWith('entry:')).length;

  // deadlocks (dedupe by stuck signature)
  const deadlocks: DeadlockFinding[] = [];
  const seenSig = new Set<string>();
  for (const s of [...sg.dead].sort((a, b) => a - b)) {
    const m = sg.states[s];
    const stuck: StuckToken[] = [];
    for (let p = 0; p < flowCount; p++) {
      if (m[p] === 0) continue;
      const flow = graph.flows[sg.places[p]];
      const target = graph.nodes[flow.targetId];
      const missing = target.incoming.filter((f) => {
        const i = sg.places.indexOf(f);
        return i >= 0 && m[i] === 0;
      });
      stuck.push({ flowId: flow.id, targetId: target.id, missingFlows: missing });
    }
    const sig = stuck.map((x) => x.targetId).sort().join('|');
    if (seenSig.has(sig)) continue;
    seenSig.add(sig);
    deadlocks.push({ stuck, trace: traceTo(sg, s) });
    if (deadlocks.length >= 5) break;
  }

  // unsafe flows (lack of synchronization) and unbounded growth
  const unsafe: UnsafeFinding[] = [];
  const unbounded: UnsafeFinding[] = [];
  const unsafeSeen = new Set<number>();
  for (let s = 0; s < sg.states.length; s++) {
    const m = sg.states[s];
    for (let p = 0; p < flowCount; p++) {
      if (m[p] >= 2 && !unsafeSeen.has(p)) {
        unsafeSeen.add(p);
        unsafe.push({ flowId: sg.places[p], count: m[p], trace: traceTo(sg, s) });
      }
    }
  }
  for (const s of sg.cut) {
    const m = sg.states[s];
    for (let p = 0; p < flowCount; p++) {
      if (m[p] > opts.maxTokensPerFlow && !unbounded.some((u) => u.flowId === sg.places[p])) {
        unbounded.push({ flowId: sg.places[p], count: m[p], trace: traceTo(sg, s) });
      }
    }
  }

  // livelocks: reachable, not dead, cannot complete
  const canComplete = statesThatCanComplete(sg);
  const livelocks: LivelockFinding[] = [];
  const trapped = sg.states.map((_, i) => i).filter((i) => !canComplete.has(i) && !sg.dead.has(i));
  if (trapped.length) {
    // states that can only reach dead states are reported as deadlocks already
    const reachesDead = new Set<number>(sg.dead);
    let changed = true;
    while (changed) {
      changed = false;
      for (const s of trapped) {
        if (reachesDead.has(s)) continue;
        if (sg.edges[s].some((e) => reachesDead.has(e.to))) {
          reachesDead.add(s);
          changed = true;
        }
      }
    }
    const pureLive = trapped.filter((s) => !reachesDead.has(s));
    if (pureLive.length) {
      const first = Math.min(...pureLive);
      const comp = stronglyConnected(pureLive, (s) => sg.edges[s].map((e) => e.to));
      const loopNodes = new Set<string>();
      for (const s of pureLive) {
        for (const e of sg.edges[s]) {
          if (comp.has(e.to) && comp.get(e.to) === comp.get(s)) loopNodes.add(e.nodeId);
        }
      }
      livelocks.push({ trace: traceTo(sg, first), loopNodeIds: [...loopNodes] });
    }
  }

  const fired = new Set<string>();
  for (const es of sg.edges) for (const e of es) {
    fired.add(e.nodeId);
    if (e.boundaryId) fired.add(e.boundaryId);
  }
  const deadNodeIds = sg.truncated
    ? []
    : sg.nodeIds.filter((id) => {
        if (fired.has(id)) return false;
        const n = graph.nodes[id];
        if (n.kind === 'boundary') return !fired.has(n.attachedTo ?? '');
        if (n.kind === 'intermediateCatch' && n.eventDefinition === 'link') return false;
        return true;
      });

  const completes = sg.initial.every((i) => canComplete.has(i)) && sg.finals.size > 0;
  const sound =
    !sg.truncated && deadlocks.length === 0 && unsafe.length === 0 && livelocks.length === 0 && unbounded.length === 0 && deadNodeIds.length === 0 && completes;

  return {
    scopeId,
    complete: !sg.truncated,
    approximations: sg.approximations,
    stateCount: sg.states.length,
    edgeCount: sg.edges.reduce((a, e) => a + e.length, 0),
    deadlocks,
    unsafe,
    livelocks,
    unbounded,
    deadNodeIds,
    firedNodeIds: [...fired],
    analysedNodeIds: sg.nodeIds,
    canComplete: completes,
    sound
  };
}

/** Tarjan's algorithm restricted to `vertices`; returns vertex -> component id. */
function stronglyConnected(vertices: number[], succ: (v: number) => number[]): Map<number, number> {
  const inSet = new Set(vertices);
  const index = new Map<number, number>();
  const low = new Map<number, number>();
  const onStack = new Set<number>();
  const stack: number[] = [];
  const comp = new Map<number, number>();
  let counter = 0;
  let compId = 0;
  const visit = (v: number) => {
    index.set(v, counter);
    low.set(v, counter);
    counter++;
    stack.push(v);
    onStack.add(v);
    for (const w of succ(v)) {
      if (!inSet.has(w)) continue;
      if (!index.has(w)) {
        visit(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }
    if (low.get(v) === index.get(v)) {
      let w: number;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        comp.set(w, compId);
      } while (w !== v);
      compId++;
    }
  };
  for (const v of vertices) if (!index.has(v)) visit(v);
  return comp;
}

/** Analyse every executable scope (processes and embedded sub-processes). */
export function analyseModel(graph: ProcessGraph, options: AnalysisOptions = {}): ModelAnalysis {
  const scopes: ScopeAnalysis[] = [];
  for (const scope of Object.values(graph.scopes)) {
    if (scope.kind === 'eventSubProcess' || scope.kind === 'adHocSubProcess') continue;
    if (scope.nodeIds.length === 0) continue;
    scopes.push(analyseScope(graph, scope.id, options));
  }
  return {
    scopes,
    sound: scopes.every((s) => s.sound),
    complete: scopes.every((s) => s.complete)
  };
}

// ---------------------------------------------------------------------------
// Deterministic token game (used for "predict the execution" exercises)

export interface TokenGameOptions {
  /**
   * Decisions per gateway id. Exclusive/event-based gateways: one flow id per
   * visit (the last entry is reused). Inclusive gateways: the selected subset.
   */
  choices?: Record<string, string[]>;
  /** Boundary events that trigger (on the first execution of their host). */
  triggeredBoundaries?: string[];
  maxSteps?: number;
}

export interface TokenGameResult {
  /** Fired node ids in execution order (sub-process content is inlined). */
  trace: string[];
  completed: boolean;
  blockedAt: StuckToken[];
  stepLimitReached: boolean;
}

export function runTokenGame(graph: ProcessGraph, scopeId: string, options: TokenGameOptions = {}): TokenGameResult {
  const choices = options.choices ?? {};
  const triggered = new Set(options.triggeredBoundaries ?? []);
  const maxSteps = options.maxSteps ?? 500;
  const visits = new Map<string, number>();
  const hostRuns = new Map<string, number>();
  const trace: string[] = [];
  let steps = 0;

  const run = (sid: string): { completed: boolean; blocked: StuckToken[] } => {
    const nodes = analysableNodes(graph, sid);
    const nodeSet = new Set(nodes.map((n) => n.id));
    const tokens = new Map<string, number>(); // flowId -> count
    const ready: string[] = []; // node ids queued to fire from entry
    const starts = entryNodes(nodes);
    const start = starts.find((n) => n.kind === 'start');
    if (start) ready.push(start.id);
    else ready.push(...starts.map((n) => n.id));

    const put = (flows: string[]) => flows.forEach((f) => tokens.set(f, (tokens.get(f) ?? 0) + 1));
    const take = (f: string) => tokens.set(f, (tokens.get(f) ?? 0) - 1);
    const has = (f: string) => (tokens.get(f) ?? 0) > 0;
    let terminated = false;

    const fire = (n: GraphNode): void => {
      steps++;
      if (n.kind === 'subProcess' && !n.triggeredByEvent && graph.scopes[n.id]?.nodeIds.length) {
        trace.push(n.id);
        run(n.id);
      } else {
        trace.push(n.id);
      }
      if (n.kind === 'end') {
        if (n.eventDefinition === 'terminate') terminated = true;
        return;
      }
      if (n.kind === 'gateway') {
        const pick = choices[n.id];
        const v = visits.get(n.id) ?? 0;
        visits.set(n.id, v + 1);
        if (n.gateway === 'parallel') return put(n.outgoing);
        if (n.gateway === 'inclusive' || n.gateway === 'complex') {
          const sel = pick?.filter((f) => n.outgoing.includes(f));
          return put(sel && sel.length ? sel : [n.defaultFlow ?? n.outgoing[0]].filter(Boolean) as string[]);
        }
        const flow = pick?.length ? pick[Math.min(v, pick.length - 1)] : n.defaultFlow ?? n.outgoing[0];
        if (flow) put([flow]);
        return;
      }
      const runs = hostRuns.get(n.id) ?? 0;
      hostRuns.set(n.id, runs + 1);
      if (runs === 0) {
        const fired = n.boundaryEvents.map((id) => graph.nodes[id]).filter((x) => x && triggered.has(x.id));
        // non-interrupting events occur while the activity continues; the first interrupting one ends it
        for (const b of fired.filter((x) => x.interrupting === false)) {
          trace.push(b.id);
          put(b.outgoing);
        }
        const interrupting = fired.find((x) => x.interrupting !== false);
        if (interrupting) {
          trace.push(interrupting.id);
          return put(interrupting.outgoing);
        }
      }
      if (n.kind === 'intermediateThrow' && n.eventDefinition === 'link') {
        const catches = nodes.filter((c) => c.kind === 'intermediateCatch' && c.eventDefinition === 'link' && (c.eventRef ?? c.name) === (n.eventRef ?? n.name));
        for (const c of catches) {
          trace.push(c.id);
          put(c.outgoing);
        }
        return;
      }
      const unconditional = n.outgoing.filter((f) => !graph.flows[f].condition || graph.flows[f].isDefault);
      put(unconditional.length ? unconditional : n.outgoing.slice(0, 1));
    };

    while (steps < maxSteps && !terminated) {
      if (ready.length) {
        fire(graph.nodes[ready.shift()!]);
        continue;
      }
      let progressed = false;
      for (const n of nodes) {
        if (n.kind === 'boundary' || n.kind === 'start') continue;
        const ins = n.incoming.filter((f) => graph.flows[f] && nodeSet.has(graph.flows[f].sourceId));
        if (!ins.some(has)) continue;
        if (n.kind === 'gateway' && n.gateway === 'parallel') {
          if (!ins.every(has)) continue;
          ins.forEach(take);
        } else if (n.kind === 'gateway' && (n.gateway === 'inclusive' || n.gateway === 'complex') && ins.length > 1) {
          // fire when no other token is still upstream of the empty inputs
          const markedOther = [...tokens.entries()].filter(([f, c]) => c > 0 && !ins.includes(f));
          const upstreamBusy = markedOther.some(([f]) => {
            const reach = forwardFrom(graph, graph.flows[f].targetId, n.id);
            return reach;
          });
          if (upstreamBusy) continue;
          ins.filter(has).forEach(take);
        } else {
          take(ins.find(has)!);
        }
        fire(n);
        progressed = true;
        break;
      }
      if (!progressed) break;
    }

    const remaining = [...tokens.entries()].filter(([, c]) => c > 0);
    const blocked: StuckToken[] = terminated
      ? []
      : remaining.map(([f]) => {
          const target = graph.nodes[graph.flows[f].targetId];
          return { flowId: f, targetId: target.id, missingFlows: target.incoming.filter((x) => !has(x)) };
        });
    return { completed: terminated || remaining.length === 0, blocked };
  };

  const result = run(scopeId);
  return { trace, completed: result.completed, blockedAt: result.blocked, stepLimitReached: steps >= maxSteps };
}

function forwardFrom(graph: ProcessGraph, fromNodeId: string, targetId: string): boolean {
  const seen = new Set<string>();
  const stack = [fromNodeId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === targetId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const n = graph.nodes[id];
    if (!n) continue;
    for (const f of n.outgoing) stack.push(graph.flows[f].targetId);
    for (const b of n.boundaryEvents) stack.push(b);
  }
  return false;
}
