import { describe, expect, it } from 'vitest';
import { buildBpmnXml } from '../../src/domain/bpmn/builder';
import { createDefaultConfig } from '../../src/domain/simulation/config';
import { validateModel } from '../../src/domain/validation/validate';
import { graphOf, SEQUENCE, splitJoin } from './helpers';

const rules = (r: Awaited<ReturnType<typeof validateModel>>) => r.issues.map((i) => i.ruleId);

describe('validator', () => {
  it('reports a fatal error for malformed XML', async () => {
    const r = await validateModel({ xml: '<bpmn:definitions' });
    expect(r.fatal).toBeTruthy();
    expect(rules(r)).toEqual(['xml-parse']);
    expect(r.counts.error).toBe(1);
  });

  it('accepts a clean sequential model and confirms soundness', async () => {
    const r = await validateModel({ xml: buildBpmnXml(SEQUENCE) });
    expect(r.counts.error).toBe(0);
    expect(r.counts.warning).toBe(0);
    expect(r.analysis.sound).toBe(true);
    expect(rules(r)).toContain('model-sound');
  });

  it('distinguishes layers and severities', async () => {
    const spec = splitJoin('exclusiveGateway', 'parallelGateway');
    const r = await validateModel({ xml: buildBpmnXml(spec) });
    const deadlock = r.issues.find((i) => i.ruleId === 'deadlock')!;
    expect(deadlock.layer).toBe('control-flow');
    expect(deadlock.severity).toBe('error');
    expect(deadlock.evidence).toBe('formal');
    expect(deadlock.elementIds).toContain('G2');
    expect(deadlock.explanation).toMatch(/Likely cause/);
    expect(deadlock.witness?.length).toBeGreaterThan(0);
    expect(deadlock.learnMore?.conceptId).toBe('deadlocks');
    expect(rules(r)).toContain('dead-element');
  });

  it('flags lack of synchronization for AND split + XOR join', async () => {
    const r = await validateModel({ xml: buildBpmnXml(splitJoin('parallelGateway', 'exclusiveGateway')) });
    const lack = r.issues.find((i) => i.ruleId === 'lack-of-synchronization');
    expect(lack).toBeTruthy();
    expect(lack!.elementIds).toContain('C');
  });

  it('detects a parallel gateway used as a decision and unlabeled XOR outcomes', async () => {
    const spec = splitJoin('parallelGateway', 'parallelGateway');
    spec.nodes[1].name = 'Approved?';
    spec.flows[1].name = 'yes';
    spec.flows[2].name = 'no';
    const r1 = await validateModel({ xml: buildBpmnXml(spec) });
    expect(rules(r1)).toContain('parallel-with-conditions');

    const xor = splitJoin('exclusiveGateway', 'exclusiveGateway');
    xor.flows[1].name = undefined;
    const r2 = await validateModel({ xml: buildBpmnXml(xor) });
    const issue = r2.issues.find((i) => i.ruleId === 'gateway-outcomes-unlabeled')!;
    expect(issue.layer).toBe('semantics');
    expect(issue.elementIds).toContain('fa');
  });

  it('detects invalid message flows inside one pool and lanes that look like participants', async () => {
    const xml = buildBpmnXml({
      pools: [
        {
          id: 'P',
          name: 'Company',
          rows: [0, 1],
          lanes: [
            { id: 'L1', name: 'Customer', rows: [0, 0] },
            { id: 'L2', name: 'Sales', rows: [1, 1] }
          ]
        }
      ],
      nodes: [
        { id: 'S', type: 'startEvent', name: 'Need', at: [0, 0] },
        { id: 'A', type: 'task', name: 'Send order', at: [1, 0] },
        { id: 'B', type: 'task', name: 'Check order', at: [2, 1] },
        { id: 'E', type: 'endEvent', name: 'Done', at: [3, 1] }
      ],
      flows: [
        { from: 'S', to: 'A' },
        { from: 'B', to: 'E' }
      ],
      messageFlows: [{ id: 'M1', from: 'A', to: 'B' }]
    });
    const r = await validateModel({ xml });
    expect(rules(r)).toContain('message-flow-same-pool');
    expect(rules(r)).toContain('lane-as-participant');
  });

  it('reports bpmnlint findings with educational texts', async () => {
    const { xml } = await graphOf({
      nodes: [
        { id: 'S', type: 'startEvent', at: [0, 0] },
        { id: 'A', type: 'task', at: [1, 0] },
        { id: 'Z', type: 'task', name: 'Orphan task', at: [1, 1] }
      ],
      flows: [{ from: 'S', to: 'A' }]
    });
    const r = await validateModel({ xml });
    const ids = rules(r);
    expect(ids).toContain('end-event-required');
    expect(ids).toContain('no-disconnected');
    expect(ids).toContain('label-required');
    const label = r.issues.find((i) => i.ruleId === 'label-required')!;
    expect(label.severity).toBe('recommendation');
    expect(label.layer).toBe('pedagogy');
    expect(label.source).toBe('bpmnlint');
    // disconnected orphan is not double-reported as dead element
    expect(r.issues.filter((i) => i.ruleId === 'dead-element' && i.elementIds.includes('Z'))).toHaveLength(0);
  });

  it('reports executability separately for both engines', async () => {
    const spec = {
      nodes: [
        { id: 'S', type: 'startEvent' as const, name: 'Start', at: [0, 0] as [number, number] },
        { id: 'G', type: 'complexGateway' as const, name: 'Complex', at: [1, 0] as [number, number] },
        { id: 'E', type: 'endEvent' as const, name: 'End', at: [2, 0] as [number, number] }
      ],
      flows: [
        { from: 'S', to: 'G' },
        { from: 'G', to: 'E' }
      ]
    };
    const { graph } = await graphOf(spec);
    const r = await validateModel({ xml: buildBpmnXml(spec), simulationConfig: createDefaultConfig(graph) });
    const token = r.issues.find((i) => i.ruleId === 'token-unsupported')!;
    expect(token.engine).toBe('token-animation');
    const perf = r.issues.find((i) => i.ruleId === 'perf-blocking')!;
    expect(perf.engine).toBe('performance-simulation');
    expect(perf.layer).toBe('executability');
  });
});
