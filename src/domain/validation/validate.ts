/**
 * Validation engine: combines bpmnlint, BPMN Studio's own structural and
 * semantic rules, formal control-flow analysis, executability checks for both
 * simulation engines, and pedagogical recommendations into one report.
 */
import { analyseModel, type ModelAnalysis, type TraceStep } from '../bpmn/behavior';
import { displayName, type GraphNode, type ProcessGraph } from '../bpmn/graph';
import { parseBpmnXml, BpmnParseError } from '../bpmn/parse';
import type { SimulationConfig } from '../simulation/config';
import { checkPerformanceSupport } from '../simulation/support';
import { runBpmnlint } from './bpmnlint';
import { RULES } from './catalog';
import {
  SEVERITY_ORDER,
  type EngineId,
  type Severity,
  type ValidationIssue,
  type ValidationLayer,
  type ValidationReport
} from './types';

export interface ValidateInput {
  xml?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  definitions?: any;
  graph?: ProcessGraph;
  parseWarnings?: string[];
  /** If given, executability for the performance simulator is checked against it. */
  simulationConfig?: SimulationConfig;
  options?: { maxStates?: number; skipLint?: boolean };
}

let issueCounter = 0;

function makeIssue(
  ruleId: string,
  elementIds: string[],
  overrides: Partial<Omit<ValidationIssue, 'id' | 'ruleId'>> = {},
  source: 'bpmnlint' | 'studio' = 'studio'
): ValidationIssue {
  const r = RULES[ruleId];
  if (!r) throw new Error(`Unknown rule ${ruleId}`);
  return {
    id: `${ruleId}-${elementIds.join('-') || 'model'}-${++issueCounter}`,
    ruleId,
    source,
    layer: r.layer,
    severity: r.severity,
    evidence: r.evidence,
    elementIds,
    title: r.title,
    explanation: r.explanation,
    consequence: r.consequence,
    suggestion: r.suggestion,
    learnMore: r.learnMore,
    ...overrides
  };
}

const QUESTION = /\?\s*$/;
const DECISION_WORDS = /^(yes|no|ja|nein|true|false|ok|not ok|approved|rejected|accept(ed)?|decline(d)?|valid|invalid|else|otherwise)$/i;
const EXTERNAL_PARTY = /\b(customer|client|supplier|vendor|bank|applicant|patient|citizen|insurer|carrier|courier|buyer|seller|partner|authority|government)s?\b/i;

function name(graph: ProcessGraph, id: string) {
  return `“${displayName(graph, id)}”`;
}

function rootScopeOf(graph: ProcessGraph, scopeId: string): string {
  let s = graph.scopes[scopeId];
  while (s?.parentScopeId) s = graph.scopes[s.parentScopeId];
  return s?.id ?? scopeId;
}

function participantOfNode(graph: ProcessGraph, id: string): string | undefined {
  const n = graph.nodes[id];
  if (n) return n.participantId ?? rootScopeOf(graph, n.scopeId);
  const p = graph.participants.find((x) => x.id === id);
  return p ? p.id : undefined;
}

// ---------------------------------------------------------------------------

function structuralAndSemanticRules(graph: ProcessGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const nodes = Object.values(graph.nodes);

  for (const f of Object.values(graph.flows)) {
    const s = graph.nodes[f.sourceId];
    const t = graph.nodes[f.targetId];
    if (!s || !t) continue;
    if (rootScopeOf(graph, s.scopeId) !== rootScopeOf(graph, t.scopeId)) {
      issues.push(makeIssue('flow-across-pools', [f.id, s.id, t.id], { explanation: `The sequence flow from ${name(graph, s.id)} to ${name(graph, t.id)} connects two different pools. ${RULES['flow-across-pools'].explanation}` }));
    } else {
      const sScope = s.kind === 'boundary' && s.attachedTo ? graph.nodes[s.attachedTo]?.scopeId ?? s.scopeId : s.scopeId;
      if (sScope !== t.scopeId) issues.push(makeIssue('flow-across-subprocess', [f.id]));
    }
  }

  for (const n of nodes) {
    if (n.kind === 'start' && n.incoming.length > 0) issues.push(makeIssue('start-with-incoming', [n.id]));
    if (n.kind === 'end' && n.outgoing.length > 0) issues.push(makeIssue('end-with-outgoing', [n.id]));
    if (n.kind === 'boundary' && n.eventDefinition !== 'compensate' && n.outgoing.length === 0) {
      issues.push(makeIssue('boundary-without-outgoing', [n.id], { explanation: `The boundary event ${name(graph, n.id)} has no outgoing sequence flow.` }));
    }

    if (n.kind === 'gateway' && n.outgoing.length > 1 && (n.gateway === 'exclusive' || n.gateway === 'inclusive')) {
      const unlabeled = n.outgoing.filter((fid) => {
        const f = graph.flows[fid];
        return !f.isDefault && !f.condition && !f.name.trim();
      });
      if (unlabeled.length > 0) {
        issues.push(
          makeIssue('gateway-outcomes-unlabeled', [n.id, ...unlabeled], {
            explanation: `${unlabeled.length} of ${n.outgoing.length} outgoing flows of ${name(graph, n.id)} have neither a label nor a condition. ${RULES['gateway-outcomes-unlabeled'].explanation}`
          })
        );
      }
      const conditional = n.outgoing.filter((fid) => graph.flows[fid].condition);
      if (n.gateway === 'exclusive' && conditional.length === n.outgoing.length && !n.defaultFlow) {
        issues.push(makeIssue('xor-without-default', [n.id]));
      }
    }

    if (n.kind === 'gateway' && n.gateway === 'parallel' && n.outgoing.length > 1) {
      const decisionLike = n.outgoing.filter((fid) => {
        const f = graph.flows[fid];
        return !!f.condition || DECISION_WORDS.test(f.name.trim());
      });
      if (decisionLike.length > 0 || QUESTION.test(n.name)) {
        issues.push(
          makeIssue('parallel-with-conditions', [n.id, ...decisionLike], {
            explanation: `${name(graph, n.id)} is a parallel gateway, but ${QUESTION.test(n.name) ? 'its label is a question' : 'its outgoing flows look like decision outcomes'}. A parallel gateway ignores conditions and always activates every outgoing path.`
          })
        );
      }
    }

    if (n.kind === 'gateway' && n.incoming.length > 1 && n.outgoing.length <= 1 && QUESTION.test(n.name)) {
      issues.push(makeIssue('join-labeled-as-question', [n.id]));
    }

    if ((n.kind === 'activity' || (n.kind === 'subProcess' && !n.triggeredByEvent)) && n.name.trim() && !/\s/.test(n.name.trim())) {
      issues.push(makeIssue('activity-naming', [n.id], { explanation: `The activity name ${name(graph, n.id)} consists of a single word.` }));
    }
  }

  // message flows
  for (const mf of Object.values(graph.messageFlows)) {
    const sp = participantOfNode(graph, mf.sourceId);
    const tp = participantOfNode(graph, mf.targetId);
    if (sp && tp && sp === tp) {
      issues.push(makeIssue('message-flow-same-pool', [mf.id, mf.sourceId, mf.targetId]));
      continue;
    }
    const s = graph.nodes[mf.sourceId];
    const t = graph.nodes[mf.targetId];
    const badSource =
      s &&
      (s.kind === 'gateway' ||
        s.kind === 'start' ||
        s.kind === 'intermediateCatch' ||
        s.kind === 'boundary' ||
        s.type === 'bpmn:ReceiveTask' ||
        (s.kind === 'end' && s.eventDefinition !== 'message' && s.eventDefinition !== 'none') ||
        (s.kind === 'intermediateThrow' && s.eventDefinition !== 'message'));
    const badTarget =
      t &&
      (t.kind === 'gateway' ||
        t.kind === 'end' ||
        t.kind === 'intermediateThrow' ||
        t.type === 'bpmn:SendTask' ||
        ((t.kind === 'start' || t.kind === 'intermediateCatch' || t.kind === 'boundary') && t.eventDefinition !== 'message'));
    if (badSource || badTarget) {
      const which = badSource ? `${name(graph, s!.id)} cannot send messages` : `${name(graph, t!.id)} cannot receive messages`;
      issues.push(makeIssue('message-flow-endpoint', [mf.id, ...(badSource ? [s!.id] : []), ...(badTarget ? [t!.id] : [])], { explanation: `${which}. ${RULES['message-flow-endpoint'].explanation}` }));
    }
  }

  // lanes
  for (const lane of graph.lanes) {
    if (lane.nodeIds.length === 0) issues.push(makeIssue('empty-lane', [lane.id], { explanation: `The lane “${lane.name || lane.id}” contains no flow elements.` }));
    if (EXTERNAL_PARTY.test(lane.name)) {
      issues.push(makeIssue('lane-as-participant', [lane.id], { explanation: `The lane “${lane.name}” sounds like an external participant. ${RULES['lane-as-participant'].explanation}` }));
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------

export function describeTrace(graph: ProcessGraph, trace: TraceStep[]): string[] {
  return trace.map((step) => {
    const node = graph.nodes[step.nodeId];
    const label = displayName(graph, step.nodeId);
    if (step.boundaryId) return `${label} is interrupted by ${displayName(graph, step.boundaryId)}`;
    if (node?.kind === 'gateway' && node.outgoing.length > 1) {
      const chosen = step.produced.map((f) => {
        const flow = graph.flows[f];
        const target = flow ? displayName(graph, flow.targetId) : f;
        return flow?.name ? `“${flow.name}” → ${target}` : `→ ${target}`;
      });
      if (node.gateway === 'parallel') return `${label} activates all branches`;
      return `${label} takes ${chosen.join(' and ')}`;
    }
    if (node?.kind === 'start') return `${label} starts the process`;
    if (node?.kind === 'end') return `${label} is reached`;
    return `${label} is executed`;
  });
}

/** Nearest split gateway upstream of all incoming flows of a join (heuristic). */
function correspondingSplit(graph: ProcessGraph, join: GraphNode): GraphNode | undefined {
  const ancestors = join.incoming.map((fid) => {
    const dist = new Map<string, number>();
    const queue: Array<[string, number]> = [[graph.flows[fid].sourceId, 0]];
    while (queue.length) {
      const [id, d] = queue.shift()!;
      if (dist.has(id) || id === join.id) continue;
      dist.set(id, d);
      const n = graph.nodes[id];
      if (!n) continue;
      for (const f of n.incoming) queue.push([graph.flows[f].sourceId, d + 1]);
      if (n.kind === 'boundary' && n.attachedTo) queue.push([n.attachedTo, d + 1]);
    }
    return dist;
  });
  let best: GraphNode | undefined;
  let bestD = Infinity;
  for (const [id, d] of ancestors[0] ?? []) {
    const n = graph.nodes[id];
    if (!n || n.kind !== 'gateway' || n.outgoing.length < 2) continue;
    if (!ancestors.every((a) => a.has(id))) continue;
    const total = ancestors.reduce((s, a) => s + a.get(id)!, 0);
    if (total < bestD || (total === bestD && d < bestD)) {
      best = n;
      bestD = total;
    }
  }
  return best;
}

function gatewaySymbol(n: GraphNode) {
  return n.gateway === 'exclusive' ? 'exclusive (XOR)' : n.gateway === 'parallel' ? 'parallel (AND)' : n.gateway === 'inclusive' ? 'inclusive (OR)' : n.gateway ?? 'gateway';
}

function controlFlowIssues(graph: ProcessGraph, analysis: ModelAnalysis, disconnected: Set<string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const formallyFlaggedJoins = new Set<string>();

  for (const scope of analysis.scopes) {
    for (const d of scope.deadlocks) {
      const joins = [...new Set(d.stuck.map((s) => s.targetId))];
      joins.forEach((j) => formallyFlaggedJoins.add(j));
      const parts = d.stuck
        .filter((s) => s.missingFlows.length > 0)
        .map((s) => {
          const missing = s.missingFlows.map((f) => {
            const src = graph.flows[f]?.sourceId;
            return src ? `from ${name(graph, src)}` : f;
          });
          return `${name(graph, s.targetId)} waits for a token ${missing.join(' and ')}`;
        });
      const join = graph.nodes[joins[0]];
      const split = join ? correspondingSplit(graph, join) : undefined;
      const cause =
        split && join && split.gateway !== join.gateway
          ? ` Likely cause: the branches were opened by the ${gatewaySymbol(split)} gateway ${name(graph, split.id)} but are closed by the ${gatewaySymbol(join)} gateway ${name(graph, join.id)}.`
          : '';
      issues.push(
        makeIssue('deadlock', [...joins, ...(split ? [split.id] : [])], {
          explanation: `${parts.join('; ')}, but that token can never arrive.${cause}`,
          witness: describeTrace(graph, d.trace)
        })
      );
    }
    for (const u of scope.unsafe) {
      const flow = graph.flows[u.flowId];
      const target = flow ? flow.targetId : u.flowId;
      formallyFlaggedJoins.add(flow?.sourceId ?? '');
      const merge = flow ? graph.nodes[flow.sourceId] : undefined;
      const split = merge && merge.kind === 'gateway' && merge.incoming.length > 1 ? correspondingSplit(graph, merge) : undefined;
      const cause = split && merge && split.gateway !== merge.gateway ? ` The parallel branches opened by ${name(graph, split.id)} are merged by ${name(graph, merge.id)}, which does not wait.` : '';
      issues.push(
        makeIssue('lack-of-synchronization', [target, ...(merge ? [merge.id] : [])], {
          explanation: `Up to ${u.count} tokens can be on the flow into ${name(graph, target)} at the same time, so it is executed more than once per case.${cause}`,
          witness: describeTrace(graph, u.trace)
        })
      );
    }
    for (const l of scope.livelocks) {
      issues.push(
        makeIssue('livelock', l.loopNodeIds, {
          explanation: `The loop through ${l.loopNodeIds.map((id) => name(graph, id)).join(', ')} has no path that leaves it.`,
          witness: describeTrace(graph, l.trace)
        })
      );
    }
    for (const u of scope.unbounded) {
      issues.push(makeIssue('unbounded', [graph.flows[u.flowId]?.targetId ?? u.flowId], { witness: describeTrace(graph, u.trace) }));
    }
    const dead = scope.deadNodeIds.filter((id) => !disconnected.has(id));
    if (dead.length) {
      const deadlockRelated = scope.deadlocks.length > 0;
      issues.push(
        makeIssue('dead-element', dead, {
          explanation: `No execution reaches ${dead.map((id) => name(graph, id)).join(', ')}.${deadlockRelated ? ' These elements lie behind the deadlock reported above.' : ''}`
        })
      );
    }
    if (!scope.complete) issues.push(makeIssue('analysis-incomplete', [scope.scopeId], { explanation: `More than ${scope.stateCount} states were reachable in ${name(graph, scope.scopeId)}; the analysis stopped early.` }));
    for (const a of scope.approximations) issues.push(makeIssue('analysis-approximation', [scope.scopeId], { explanation: a }));
  }

  // structural pairing heuristic, only where formal analysis found nothing
  for (const n of Object.values(graph.nodes)) {
    if (n.kind !== 'gateway' || n.incoming.length < 2 || formallyFlaggedJoins.has(n.id)) continue;
    if (n.gateway !== 'exclusive' && n.gateway !== 'parallel') continue;
    const split = correspondingSplit(graph, n);
    if (!split || split.gateway === n.gateway || split.gateway === 'eventBased' || (split.gateway !== 'exclusive' && split.gateway !== 'parallel')) continue;
    const scope = analysis.scopes.find((s) => s.scopeId === n.scopeId);
    if (scope && scope.complete) continue; // formal analysis covered it and found no problem
    issues.push(
      makeIssue('gateway-mismatch', [split.id, n.id], {
        explanation: `The ${gatewaySymbol(split)} split ${name(graph, split.id)} appears to be closed by the ${gatewaySymbol(n)} join ${name(graph, n.id)}.`
      })
    );
  }

  if (analysis.scopes.length > 0 && analysis.sound) {
    const states = analysis.scopes.reduce((a, s) => a + s.stateCount, 0);
    issues.push(makeIssue('model-sound', [], { explanation: `${RULES['model-sound'].explanation} (${states} reachable states analyzed.)` }));
  }
  return issues;
}

// ---------------------------------------------------------------------------

function tokenAnimationIssues(graph: ProcessGraph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const engine: EngineId = 'token-animation';
  const complex = Object.values(graph.nodes).filter((n) => n.gateway === 'complex');
  for (const c of complex) issues.push(makeIssue('token-unsupported', [c.id], { engine, explanation: `Complex gateway ${name(graph, c.id)} is not supported by the token animation.` }));
  const manual = Object.values(graph.nodes).filter(
    (n) => (n.kind === 'intermediateCatch' && n.eventDefinition !== 'link') || n.type === 'bpmn:ReceiveTask' || n.gateway === 'eventBased'
  );
  if (manual.length) issues.push(makeIssue('token-manual-trigger', manual.map((n) => n.id), { engine }));
  return issues;
}

function performanceIssues(graph: ProcessGraph, config: SimulationConfig): ValidationIssue[] {
  const report = checkPerformanceSupport(graph, config);
  const engine: EngineId = 'performance-simulation';
  return report.findings.map((f) => {
    const rule = f.level === 'blocking' ? 'perf-blocking' : f.level === 'approximation' ? 'perf-approximation' : 'perf-assumption';
    return makeIssue(rule, f.elementIds, { engine, explanation: f.message });
  });
}

// ---------------------------------------------------------------------------

export async function validateModel(input: ValidateInput): Promise<ValidationReport> {
  issueCounter = 0;
  const issues: ValidationIssue[] = [];
  let definitions = input.definitions;
  let graph = input.graph;
  let warnings = input.parseWarnings ?? [];

  if (!definitions || !graph) {
    if (!input.xml) throw new Error('validateModel requires xml or definitions + graph');
    try {
      const parsed = await parseBpmnXml(input.xml);
      definitions = parsed.definitions;
      graph = parsed.graph;
      warnings = parsed.warnings;
    } catch (err) {
      const message = err instanceof BpmnParseError ? err.message : String(err);
      const fatal = makeIssue('xml-parse', [], { explanation: `${RULES['xml-parse'].explanation} Parser message: ${message}` });
      return finalize([fatal], null, message);
    }
  }

  for (const w of warnings) issues.push(makeIssue('xml-warning', [], { explanation: w }));

  // bpmnlint
  const disconnected = new Set<string>();
  if (!input.options?.skipLint) {
    try {
      const reports = await runBpmnlint(definitions);
      for (const r of reports) {
        const rule = RULES[r.rule];
        if (!rule) continue;
        if (r.rule === 'no-disconnected') disconnected.add(r.id);
        const el = graph.nodes[r.id] ? name(graph, r.id) : graph.flows[r.id] ? `Flow ${name(graph, r.id)}` : `“${r.id}”`;
        issues.push(makeIssue(r.rule, [r.id], { explanation: `${el}: ${rule.explanation}` }, 'bpmnlint'));
      }
    } catch (err) {
      issues.push(makeIssue('xml-warning', [], { explanation: `bpmnlint could not run: ${err instanceof Error ? err.message : String(err)}` }));
    }
  }

  issues.push(...structuralAndSemanticRules(graph));

  const analysis = analyseModel(graph, { maxStates: input.options?.maxStates ?? 20000 });
  issues.push(...controlFlowIssues(graph, analysis, disconnected));
  issues.push(...tokenAnimationIssues(graph));
  if (input.simulationConfig) issues.push(...performanceIssues(graph, input.simulationConfig));

  return finalize(issues, analysis);
}

function finalize(issues: ValidationIssue[], analysis: ModelAnalysis | null, fatal?: string): ValidationReport {
  // de-duplicate identical rule/element combinations
  const seen = new Set<string>();
  const unique = issues.filter((i) => {
    const key = `${i.ruleId}|${i.elementIds.join(',')}|${i.explanation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const counts: Record<Severity, number> = { error: 0, warning: 0, recommendation: 0, info: 0 };
  const byLayer: Record<ValidationLayer, number> = { structure: 0, semantics: 0, 'control-flow': 0, executability: 0, pedagogy: 0 };
  for (const i of unique) {
    counts[i.severity]++;
    byLayer[i.layer]++;
  }
  return {
    issues: unique,
    counts,
    byLayer,
    analysis: {
      performed: !!analysis,
      sound: analysis ? analysis.sound : null,
      complete: analysis ? analysis.complete : false,
      stateCount: analysis ? analysis.scopes.reduce((a, s) => a + s.stateCount, 0) : 0,
      approximations: analysis ? analysis.scopes.flatMap((s) => s.approximations) : []
    },
    fatal,
    generatedAt: new Date().toISOString()
  };
}
