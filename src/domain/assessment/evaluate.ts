/**
 * Challenge assessment. Combines structural constraints, behavioral
 * properties of the reachable state space, validation results, expected
 * execution traces and simulation-based performance targets. Diagrams are
 * never compared visually: different models with equivalent behavior pass.
 */
import { analyseModel, runTokenGame } from '../bpmn/behavior';
import { displayName, type GraphNode, type ProcessGraph } from '../bpmn/graph';
import type { ValidationReport } from '../validation/types';
import { ASSESSMENT_SCHEMA_VERSION, type AssessmentDimension, type AssessmentResult, type CriterionResult } from '../contracts';
import { getConceptTitle } from './conceptTitles';
import { BehaviorModel } from './queries';
import type { Criterion, ImproveChallenge, ModelChallenge, PerformanceTarget, PredictChallenge, Role, DeadlockChallenge } from './types';

// ---------------------------------------------------------------------------
// Roles

function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

const KIND_FILTER: Record<NonNullable<Role['kinds']>[number], (n: GraphNode) => boolean> = {
  activity: (n) => n.kind === 'activity' || n.kind === 'subProcess',
  event: (n) => n.kind === 'intermediateCatch' || n.kind === 'intermediateThrow' || n.kind === 'boundary',
  start: (n) => n.kind === 'start',
  end: (n) => n.kind === 'end',
  gateway: (n) => n.kind === 'gateway'
};

export function matchRole(graph: ProcessGraph, role: Role): string[] {
  const kinds = role.kinds ?? ['activity'];
  return Object.values(graph.nodes)
    .filter((n) => kinds.some((k) => KIND_FILTER[k](n)))
    .filter((n) => {
      const name = normalize(n.name);
      return name && role.keywords.some((k) => name.includes(normalize(k)));
    })
    .map((n) => n.id);
}

/** Map a node to its ancestor at the given scope (sub-process content is represented by the sub-process). */
function liftToScope(graph: ProcessGraph, nodeId: string, scopeId: string): string | undefined {
  let n: GraphNode | undefined = graph.nodes[nodeId];
  while (n && n.scopeId !== scopeId) {
    const parentScope: ProcessGraph["scopes"][string] | undefined = graph.scopes[n.scopeId];
    if (!parentScope || parentScope.kind === 'process') return undefined;
    n = graph.nodes[parentScope.id];
  }
  return n?.id;
}

function rootScopeOf(graph: ProcessGraph, nodeId: string): string {
  let s = graph.scopes[graph.nodes[nodeId]?.scopeId];
  while (s?.parentScopeId) s = graph.scopes[s.parentScopeId];
  return s?.id ?? graph.rootScopeIds[0];
}

// ---------------------------------------------------------------------------

export interface ModelEvaluationContext {
  graph: ProcessGraph;
  report: ValidationReport | null;
  performance?: PerformanceOutcome;
}

export interface PerformanceOutcome {
  values: Partial<Record<PerformanceTarget['metric'], number>>;
  totalWorkers: number;
  incompleteCases: number;
  error?: string;
}

const CRITERION_CONCEPT: Partial<Record<Criterion['kind'], string>> = {
  sound: 'deadlocks',
  exclusive: 'xor-gateway',
  concurrent: 'and-gateway',
  precedes: 'sequence-flows',
  always: 'process-structure',
  optional: 'xor-gateway',
  boundary: 'boundary-events',
  pools: 'pools-lanes',
  messageFlows: 'message-flows',
  endEvents: 'events-basics',
  gateway: 'xor-gateway'
};

export function evaluateModelChallenge(ch: ModelChallenge | ImproveChallenge, ctx: ModelEvaluationContext): AssessmentResult {
  const { graph, report } = ctx;
  const roles = new Map(ch.roles.map((r) => [r.id, r]));
  const matched = new Map(ch.roles.map((r) => [r.id, matchRole(graph, r)]));
  const results: CriterionResult[] = [];
  const conceptForResult = new Map<string, string>();

  // behavior model on the top-level process that contains most role elements
  const counts = new Map<string, number>();
  for (const ids of matched.values()) for (const id of ids) counts.set(rootScopeOf(graph, id), (counts.get(rootScopeOf(graph, id)) ?? 0) + 1);
  const scopeId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? graph.rootScopeIds.find((id) => graph.scopes[id].nodeIds.length) ?? graph.rootScopeIds[0];
  let behavior: BehaviorModel | null = null;
  const getBehavior = () => {
    if (!behavior && scopeId && graph.scopes[scopeId]) behavior = new BehaviorModel(graph, scopeId);
    return behavior;
  };
  const roleSet = (id: string) => new Set((matched.get(id) ?? []).map((n) => liftToScope(graph, n, scopeId)).filter((x): x is string => !!x));
  const roleName = (id: string) => `“${roles.get(id)?.label ?? id}”`;
  const missingRoleFeedback = (id: string) => {
    const r = roles.get(id);
    return `No element for ${roleName(id)} was found. Name the corresponding ${r?.kinds?.includes('end') ? 'end event' : 'activity'} so that it contains a word such as “${r?.keywords[0]}”.`;
  };

  ch.criteria.forEach((c, index) => {
    const id = `${c.kind}-${index}`;
    const weight = c.weight ?? 1;
    const push = (dimension: AssessmentDimension, label: string, ok: boolean | 'partial' | 'na', feedback: string, rationale?: string, elementIds?: string[]) => {
      results.push({
        id,
        dimension,
        label,
        status: ok === 'na' ? 'not-applicable' : ok === 'partial' ? 'partial' : ok ? 'met' : 'not-met',
        feedback,
        rationale,
        elementIds,
        weight
      });
      const concept = CRITERION_CONCEPT[c.kind];
      if (concept) conceptForResult.set(id, concept);
    };

    switch (c.kind) {
      case 'role': {
        const ids = matched.get(c.role) ?? [];
        push(
          'scenario',
          `The model contains ${roleName(c.role)}`,
          ids.length > 0,
          ids.length ? `Found: ${ids.map((n) => `“${displayName(graph, n)}”`).join(', ')}.` : missingRoleFeedback(c.role),
          'Every activity required by the scenario must appear in the model.',
          ids
        );
        break;
      }
      case 'gateway': {
        const gws = Object.values(graph.nodes).filter((n) => n.gateway === c.gateway && n.outgoing.length > 1);
        push('structure', c.label, gws.length >= c.min, gws.length >= c.min ? `Found ${gws.length} splitting ${c.gateway} gateway(s).` : `Expected at least ${c.min} splitting ${c.gateway} gateway(s), found ${gws.length}.`, undefined, gws.map((g) => g.id));
        break;
      }
      case 'endEvents': {
        const ends = Object.values(graph.nodes).filter((n) => n.kind === 'end' && n.name.trim());
        push('structure', `At least ${c.min} named end events (one per outcome)`, ends.length >= c.min, ends.length >= c.min ? `Found ${ends.length} named end events.` : `Found ${ends.length} named end event(s). Give each business outcome its own end event.`, 'Separate end events make the possible outcomes of the process visible.');
        break;
      }
      case 'sound': {
        const a = analyseModel(graph);
        const problems = a.scopes.flatMap((s) => [
          ...s.deadlocks.map(() => 'a deadlock'),
          ...s.unsafe.map(() => 'missing synchronization (duplicated work)'),
          ...s.livelocks.map(() => 'a loop without exit'),
          ...(s.deadNodeIds.length ? ['unreachable elements'] : [])
        ]);
        push(
          'behavior',
          'The control flow is sound',
          a.scopes.length > 0 && a.sound,
          a.sound ? 'Every execution can complete; no deadlocks, no duplicated tokens, no dead paths.' : `The formal analysis found ${[...new Set(problems)].join(', ') || 'problems'}. Open the Issues panel for details.`,
          'A model that can deadlock or duplicate work would make real cases get stuck or be handled twice.'
        );
        break;
      }
      case 'noErrors': {
        const errors = (report?.issues ?? []).filter((i) => i.severity === 'error' && i.layer !== 'executability');
        push(
          'semantics',
          'No BPMN errors',
          report ? errors.length === 0 : 'na',
          !report ? 'Validation has not run yet.' : errors.length === 0 ? 'The validator reports no errors.' : `The validator reports ${errors.length} error(s): ${[...new Set(errors.map((e) => e.title))].join('; ')}.`,
          'Invalid BPMN cannot be exchanged reliably between tools or executed.',
          errors.flatMap((e) => e.elementIds)
        );
        if (errors[0]?.learnMore) conceptForResult.set(id, errors[0].learnMore.conceptId);
        break;
      }
      case 'always': {
        const set = roleSet(c.role);
        if (!set.size) return push('behavior', `${roleName(c.role)} happens in every case`, false, missingRoleFeedback(c.role));
        const ok = getBehavior()!.always(set);
        push('behavior', `${roleName(c.role)} happens in every case`, ok, ok ? 'Every complete execution contains it.' : `There is a way to complete the process without ${roleName(c.role)}.`, 'The scenario requires this step for all cases.', [...set]);
        break;
      }
      case 'optional': {
        const set = roleSet(c.role);
        if (!set.size) return push('behavior', `${roleName(c.role)} happens only in some cases`, false, missingRoleFeedback(c.role));
        const b = getBehavior()!;
        const possible = b.possible(set);
        const always = b.always(set);
        push(
          'behavior',
          `${roleName(c.role)} happens only in some cases`,
          possible && !always,
          !possible ? `No complete execution reaches ${roleName(c.role)}.` : always ? `${roleName(c.role)} happens in every case, but the scenario describes it as conditional. Use a decision (gateway) or an event.` : 'Correct: it depends on the situation.',
          undefined,
          [...set]
        );
        break;
      }
      case 'exclusive': {
        const [a, b] = c.roles;
        const sa = roleSet(a);
        const sb = roleSet(b);
        if (!sa.size || !sb.size) return push('behavior', `${roleName(a)} and ${roleName(b)} are alternatives`, false, missingRoleFeedback(!sa.size ? a : b));
        const ok = getBehavior()!.exclusive(sa, sb);
        push('behavior', `${roleName(a)} and ${roleName(b)} are alternatives`, ok, ok ? 'No case executes both.' : `Some cases execute both ${roleName(a)} and ${roleName(b)}. Use an exclusive gateway so that exactly one of them happens.`, 'Alternatives such as “approve” and “reject” must never happen for the same case.', [...sa, ...sb]);
        break;
      }
      case 'precedes': {
        const sa = roleSet(c.before);
        const sb = roleSet(c.after);
        if (!sa.size || !sb.size) return push('behavior', `${roleName(c.before)} happens before ${roleName(c.after)}`, false, missingRoleFeedback(!sa.size ? c.before : c.after));
        const ok = getBehavior()!.precedes(sa, sb);
        push('behavior', `${roleName(c.before)} happens before ${roleName(c.after)}`, ok, ok ? 'The order is respected in every execution.' : `${roleName(c.after)} can happen before ${roleName(c.before)}.`, 'The scenario defines this order.', [...sa, ...sb]);
        break;
      }
      case 'concurrent': {
        const [a, b] = c.roles;
        const sa = roleSet(a);
        const sb = roleSet(b);
        if (!sa.size || !sb.size) return push('behavior', `${roleName(a)} and ${roleName(b)} can run in parallel`, false, missingRoleFeedback(!sa.size ? a : b));
        const ok = getBehavior()!.concurrent(sa, sb);
        push('behavior', `${roleName(a)} and ${roleName(b)} can run in parallel`, ok, ok ? 'Both can be active at the same time.' : `${roleName(a)} and ${roleName(b)} are executed one after the other. Use a parallel gateway to let them run independently.`, 'Independent work done in parallel shortens the cycle time.', [...sa, ...sb]);
        break;
      }
      case 'boundary': {
        const ids = matched.get(c.role) ?? [];
        const found = ids.flatMap((h) => graph.nodes[h].boundaryEvents.map((b) => graph.nodes[b])).filter((b) => b && b.eventDefinition === c.event && (c.interrupting === undefined || (b.interrupting !== false) === c.interrupting));
        const kindText = `${c.interrupting === false ? 'non-interrupting ' : c.interrupting ? 'interrupting ' : ''}${c.event}`;
        push(
          'scenario',
          `Exception handling: ${kindText} boundary event on ${roleName(c.role)}`,
          ids.length ? found.length > 0 && found.every((b) => b.outgoing.length > 0) : false,
          !ids.length ? missingRoleFeedback(c.role) : found.length === 0 ? `Attach a ${kindText} boundary event to ${roleName(c.role)}.` : found.some((b) => b.outgoing.length === 0) ? 'The boundary event exists, but its exception path is missing.' : 'The exception is handled.',
          'The scenario specifies what must happen when the exception occurs.',
          found.map((b) => b.id)
        );
        break;
      }
      case 'pools': {
        const n = graph.participants.length;
        push('structure', `At least ${c.min} pools (participants)`, n >= c.min, `Found ${n} pool(s).`, 'Independent parties are separate participants.');
        break;
      }
      case 'messageFlows': {
        const n = Object.keys(graph.messageFlows).length;
        push('structure', `At least ${c.min} message flows`, n >= c.min, `Found ${n} message flow(s).`, 'Communication between participants is shown with message flows.');
        break;
      }
    }
  });

  if (ch.type === 'improve') {
    const p = ctx.performance;
    if (!p) {
      results.push({ id: 'performance-pending', dimension: 'performance', label: 'Performance targets', status: 'not-applicable', feedback: 'Run the assessment to simulate your redesign.', weight: 1 });
    } else if (p.error) {
      results.push({ id: 'performance-error', dimension: 'performance', label: 'Performance targets', status: 'not-met', feedback: `The redesign could not be simulated: ${p.error}`, weight: ch.targets.length });
    } else {
      results.push({
        id: 'budget',
        dimension: 'performance',
        label: `Staff budget: at most ${ch.maxWorkers} workers`,
        status: p.totalWorkers <= ch.maxWorkers ? 'met' : 'not-met',
        feedback: `Your resource pools contain ${p.totalWorkers} worker(s) in total.`,
        rationale: 'Improvements must be achieved with the available staff.',
        weight: 1
      });
      if (p.incompleteCases > 0) {
        results.push({ id: 'complete', dimension: 'performance', label: 'All simulated cases complete', status: 'not-met', feedback: `${p.incompleteCases} case(s) did not complete — check the model for deadlocks.`, weight: 1 });
      }
      ch.targets.forEach((t, i) => {
        const v = p.values[t.metric];
        const ok = v !== undefined && Number.isFinite(v) && (t.op === '<=' ? v <= t.value : v >= t.value);
        results.push({
          id: `target-${i}`,
          dimension: 'performance',
          label: t.label,
          status: ok ? 'met' : 'not-met',
          feedback: v === undefined ? 'Not measured.' : `Measured: ${formatMetric(t.metric, v)} (target ${t.op} ${formatMetric(t.metric, t.value)}).`,
          weight: 1
        });
        conceptForResult.set(`target-${i}`, 'and-gateway');
      });
    }
  }

  return finish(ch, results, conceptForResult);
}

export function formatMetric(metric: PerformanceTarget['metric'], v: number): string {
  if (metric === 'costPerCase') return `€${v.toFixed(2)}`;
  if (metric === 'slaCompliance' || metric === 'maxUtilization') return `${(v * 100).toFixed(1)}%`;
  return v >= 120 ? `${(v / 60).toFixed(1)} h` : `${v.toFixed(1)} min`;
}

function finish(ch: { id: string; concepts: string[] }, criteria: CriterionResult[], conceptFor: Map<string, string>): AssessmentResult {
  const applicable = criteria.filter((c) => c.status !== 'not-applicable');
  const total = applicable.reduce((a, c) => a + c.weight, 0);
  const gained = applicable.reduce((a, c) => a + (c.status === 'met' ? c.weight : c.status === 'partial' ? c.weight / 2 : 0), 0);
  const score = total > 0 ? gained / total : 0;
  const passed = applicable.length > 0 && applicable.length === criteria.length && applicable.every((c) => c.status === 'met');
  const firstUnmet = criteria.find((c) => c.status === 'not-met' || c.status === 'partial');
  const conceptId = (firstUnmet && conceptFor.get(firstUnmet.id)) ?? ch.concepts[0];
  return {
    schemaVersion: ASSESSMENT_SCHEMA_VERSION,
    challengeId: ch.id,
    submittedAt: new Date().toISOString(),
    score,
    passed,
    criteria,
    strengths: criteria.filter((c) => c.status === 'met').map((c) => c.label),
    improvements: criteria.filter((c) => c.status === 'not-met' || c.status === 'partial').map((c) => `${c.label}: ${c.feedback}`),
    nextConcept: !passed && conceptId ? { conceptId, label: getConceptTitle(conceptId) } : undefined
  };
}

// ---------------------------------------------------------------------------

export function expectedExecution(ch: PredictChallenge, graph: ProcessGraph, scenarioId: string): string[] {
  const sc = ch.scenarios.find((s) => s.id === scenarioId)!;
  const scope = graph.rootScopeIds.find((id) => graph.scopes[id].nodeIds.length) ?? graph.rootScopeIds[0];
  const r = runTokenGame(graph, scope, { choices: sc.choices, triggeredBoundaries: sc.triggeredBoundaries });
  return ch.candidates.filter((c) => r.trace.includes(c));
}

export function evaluatePrediction(ch: PredictChallenge, graph: ProcessGraph, answers: Record<string, string[]>): AssessmentResult {
  const criteria: CriterionResult[] = ch.scenarios.map((sc) => {
    const expected = new Set(expectedExecution(ch, graph, sc.id));
    const given = new Set(answers[sc.id] ?? []);
    const missed = [...expected].filter((x) => !given.has(x));
    const extra = [...given].filter((x) => !expected.has(x));
    const ok = missed.length === 0 && extra.length === 0;
    const parts: string[] = [];
    if (missed.length) parts.push(`Also executed: ${missed.map((x) => `“${displayName(graph, x)}”`).join(', ')}.`);
    if (extra.length) parts.push(`Not executed: ${extra.map((x) => `“${displayName(graph, x)}”`).join(', ')}.`);
    return {
      id: sc.id,
      dimension: 'scenario',
      label: sc.description,
      status: ok ? 'met' : missed.length + extra.length <= 1 ? 'partial' : 'not-met',
      feedback: ok ? 'Correct prediction.' : parts.join(' '),
      rationale: 'Predicting executions shows that you understand the token semantics of gateways and events.',
      elementIds: [...missed, ...extra],
      weight: 1
    };
  });
  return finish(ch, criteria, new Map(criteria.map((c) => [c.id, ch.concepts[0]])));
}

export function deadlockCulprits(graph: ProcessGraph): { joins: string[]; splits: string[] } {
  const a = analyseModel(graph);
  const joins = [...new Set(a.scopes.flatMap((s) => s.deadlocks.flatMap((d) => d.stuck.map((x) => x.targetId))))];
  // the split whose branches are joined by a mismatched join
  const splits: string[] = [];
  for (const j of joins) {
    const join = graph.nodes[j];
    for (const f of join.incoming) {
      const stack = [graph.flows[f].sourceId];
      const seen = new Set<string>();
      while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        const n = graph.nodes[id];
        if (!n) continue;
        if (n.kind === 'gateway' && n.outgoing.length > 1 && n.gateway !== join.gateway) {
          splits.push(n.id);
          continue;
        }
        if (n.kind === 'gateway' && n.outgoing.length > 1) continue;
        for (const inc of n.incoming) stack.push(graph.flows[inc].sourceId);
      }
    }
  }
  return { joins, splits: [...new Set(splits)] };
}

export function evaluateDeadlock(ch: DeadlockChallenge, graph: ProcessGraph, clicked: string | null, option: number | null): AssessmentResult {
  const { joins, splits } = deadlockCulprits(graph);
  const located = !!clicked && (joins.includes(clicked) || splits.includes(clicked));
  const criteria: CriterionResult[] = [
    {
      id: 'locate',
      dimension: 'behavior',
      label: 'Locate the structural cause',
      status: located ? 'met' : 'not-met',
      feedback: located
        ? `Correct: tokens get stuck at ${joins.map((j) => `“${displayName(graph, j)}”`).join(', ')}${splits.length ? `, whose branches are opened by ${splits.map((s) => `“${displayName(graph, s)}”`).join(', ')}` : ''}.`
        : clicked
          ? `“${displayName(graph, clicked)}” is not where the execution blocks. Run the token simulation and watch where tokens stop waiting.`
          : 'Select an element in the diagram.',
      rationale: 'Deadlocks are caused by a join that waits for tokens that can never arrive.',
      elementIds: [...joins, ...splits],
      weight: 1
    },
    {
      id: 'explain',
      dimension: 'reasoning',
      label: 'Explain why the execution blocks',
      status: option === null ? 'not-met' : option === ch.correctOption ? 'met' : 'not-met',
      feedback: option === null ? 'Choose an explanation.' : option === ch.correctOption ? 'Correct explanation.' : `Not quite. ${ch.options[ch.correctOption]}`,
      weight: 1
    }
  ];
  return finish(ch, criteria, new Map([['locate', 'deadlocks'], ['explain', 'deadlocks']]));
}

export function evaluateComparison(
  ch: { id: string; concepts: string[]; reasons: Array<{ text: string; correctFor: string | null }>; alternatives: Array<{ id: string; name: string }>; better: 'lower' | 'higher'; metric: string },
  values: Record<string, number>,
  choice: string | null,
  reason: number | null
): AssessmentResult {
  const [a, b] = ch.alternatives;
  const winner = ch.better === 'lower' ? (values[a.id] <= values[b.id] ? a : b) : values[a.id] >= values[b.id] ? a : b;
  const criteria: CriterionResult[] = [
    {
      id: 'choice',
      dimension: 'performance',
      label: 'Choose the better alternative based on the simulation',
      status: choice === winner.id ? 'met' : 'not-met',
      feedback: choice === null ? 'Choose an alternative.' : choice === winner.id ? `Correct: “${winner.name}” performs better.` : `The simulation shows that “${winner.name}” performs better.`,
      weight: 1
    },
    {
      id: 'reason',
      dimension: 'reasoning',
      label: 'Explain the result',
      status: reason !== null && ch.reasons[reason]?.correctFor === winner.id ? 'met' : 'not-met',
      feedback:
        reason === null
          ? 'Choose the explanation that fits the result.'
          : ch.reasons[reason]?.correctFor === winner.id
            ? 'Your explanation matches the mechanism behind the result.'
            : `This explanation does not account for the result. ${ch.reasons.find((r) => r.correctFor === winner.id)?.text ?? ''}`,
      weight: 1
    }
  ];
  return finish(ch, criteria, new Map([['choice', ch.concepts[0]], ['reason', ch.concepts[0]]]));
}
