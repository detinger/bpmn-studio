import { describe, expect, it } from 'vitest';
import { ENTRIES, getEntry } from '../../src/data/encyclopedia';
import { ALL_CONCEPTS, LEVELS } from '../../src/data/lessons';
import { buildBpmnXml } from '../../src/domain/bpmn/builder';
import { parseBpmnXml } from '../../src/domain/bpmn/parse';
import { runTokenGame } from '../../src/domain/bpmn/behavior';
import { validateModel } from '../../src/domain/validation/validate';

describe('encyclopedia', () => {
  it('covers every element listed in the plan', () => {
    const required = [
      'start-event', 'end-event', 'intermediate-catch-event', 'intermediate-throw-event', 'timer-event', 'message-event', 'error-event', 'escalation-event',
      'signal-event', 'conditional-event', 'boundary-event', 'terminate-end-event', 'task', 'user-task', 'service-task', 'manual-task', 'script-task',
      'business-rule-task', 'send-task', 'receive-task', 'subprocess', 'call-activity', 'loop-activity', 'multi-instance-activity', 'exclusive-gateway',
      'parallel-gateway', 'inclusive-gateway', 'event-based-gateway', 'complex-gateway', 'pool', 'lane', 'sequence-flow', 'message-flow', 'association',
      'data-object', 'data-store', 'group', 'text-annotation'
    ];
    for (const id of required) expect(getEntry(id), id).toBeTruthy();
    expect(ENTRIES).toHaveLength(required.length);
  });

  it('has all seven educational facets for each entry', () => {
    for (const e of ENTRIES) {
      expect(e.name).toBeTruthy();
      expect(e.graphical.length).toBeGreaterThan(20);
      expect(e.semantics.length).toBeGreaterThan(20);
      expect(e.useCases.length).toBeGreaterThan(0);
      expect(e.mistakes.length).toBeGreaterThan(0);
      expect(e.related.length).toBeGreaterThan(0);
      expect(e.demos.length).toBeGreaterThan(0);
      for (const r of e.related) expect(getEntry(r), `${e.id} -> ${r}`).toBeTruthy();
    }
  });

  it.each(ENTRIES.flatMap((e) => e.demos.map((d, i) => [`${e.id}#${i}`, d.spec] as const)))('demo %s parses cleanly', async (_id, spec) => {
    const { warnings } = await parseBpmnXml(buildBpmnXml(spec));
    expect(warnings).toEqual([]);
  });
});

describe('lessons', () => {
  it('provides five levels with the concepts of the plan', () => {
    expect(LEVELS.map((l) => l.concepts.length)).toEqual([4, 4, 5, 3, 6]);
    const ids = new Set(ALL_CONCEPTS.map((c) => c.id));
    expect(ids.size).toBe(ALL_CONCEPTS.length);
  });

  it.each(ALL_CONCEPTS.map((c) => [c.id, c] as const))('%s has complete, valid material', async (_id, c) => {
    expect(c.explanation.length).toBeGreaterThan(100);
    expect(c.quiz.length).toBeGreaterThanOrEqual(2);
    for (const q of c.quiz) {
      expect(q.correct.length).toBeGreaterThan(0);
      for (const i of q.correct) expect(i).toBeLessThan(q.options.length);
    }
    for (const spec of [c.example.spec, c.demo.spec, c.mistake.spec, 'spec' in c.exercise && c.exercise.spec ? c.exercise.spec : null]) {
      if (!spec) continue;
      const { warnings } = await parseBpmnXml(buildBpmnXml(spec));
      expect(warnings).toEqual([]);
    }
    // the example illustrates good practice: no errors
    const report = await validateModel({ xml: buildBpmnXml(c.example.spec) });
    expect(report.issues.filter((i) => i.severity === 'error').map((i) => i.ruleId)).toEqual([]);
    // the mistake actually shows a finding (or is a semantic/pedagogical mistake explained in text)
    for (const e of c.encyclopedia) expect(getEntry(e), `${c.id} -> ${e}`).toBeTruthy();
  });

  it('predict exercises have a deterministic answer', async () => {
    for (const c of ALL_CONCEPTS) {
      const ex = c.exercise;
      if (ex.kind !== 'predict') continue;
      const { graph } = await parseBpmnXml(buildBpmnXml(ex.spec));
      const r = runTokenGame(graph, graph.rootScopeIds[0], { choices: ex.choices, triggeredBoundaries: ex.triggeredBoundaries });
      expect(r.completed, c.id).toBe(true);
      const executed = ex.candidates.filter((id) => r.trace.includes(id));
      expect(executed.length, c.id).toBeGreaterThan(0);
      for (const id of ex.candidates) expect(graph.nodes[id], `${c.id}: ${id}`).toBeTruthy();
    }
  });

  it('click exercises reference existing elements', async () => {
    for (const c of ALL_CONCEPTS) {
      const ex = c.exercise;
      if (ex.kind !== 'click') continue;
      const { graph } = await parseBpmnXml(buildBpmnXml(ex.spec));
      for (const id of ex.correctIds) expect(graph.nodes[id], `${c.id}: ${id}`).toBeTruthy();
    }
  });
});
