import { describe, expect, it } from 'vitest';
import { analyseModel, analyseScope, runTokenGame } from '../../src/domain/bpmn/behavior';
import { graphOf, SEQUENCE, splitJoin } from './helpers';

describe('builder + graph', () => {
  it('produces BPMN XML that bpmn-moddle parses without warnings', async () => {
    const { graph, warnings, xml } = await graphOf(SEQUENCE);
    expect(warnings).toEqual([]);
    expect(xml).toContain('bpmndi:BPMNEdge');
    expect(Object.keys(graph.nodes)).toHaveLength(4);
    expect(graph.nodes.A.incoming).toHaveLength(1);
    expect(graph.nodes.A.outgoing).toHaveLength(1);
    expect(graph.rootScopeIds).toEqual(['Process_1']);
  });

  it('builds collaborations with lanes, message flows and boundary events', async () => {
    const { graph, warnings } = await graphOf({
      pools: [
        { id: 'P1', name: 'Customer', rows: [0, 0], blackBox: true },
        {
          id: 'P2',
          name: 'Shop',
          rows: [1, 2],
          lanes: [
            { id: 'L1', name: 'Sales', rows: [1, 1] },
            { id: 'L2', name: 'Warehouse', rows: [2, 2] }
          ]
        }
      ],
      nodes: [
        { id: 'S', type: 'startEvent', event: 'message', name: 'Order received', at: [0, 1] },
        { id: 'A', type: 'userTask', name: 'Check order', at: [1, 1] },
        { id: 'T', type: 'boundaryEvent', event: 'timer', attachedTo: 'A', at: [1, 1] },
        { id: 'X', type: 'endEvent', name: 'Timed out', at: [2, 1.6] },
        { id: 'B', type: 'manualTask', name: 'Pack goods', at: [2, 2] },
        { id: 'E', type: 'endEvent', name: 'Done', at: [3, 2] }
      ],
      flows: [
        { from: 'S', to: 'A' },
        { from: 'A', to: 'B' },
        { from: 'T', to: 'X' },
        { from: 'B', to: 'E' }
      ],
      messageFlows: [{ from: 'P1', to: 'S', name: 'order' }]
    });
    expect(warnings).toEqual([]);
    expect(graph.isCollaboration).toBe(true);
    expect(graph.participants).toHaveLength(2);
    expect(graph.lanes.map((l) => l.nodeIds.length)).toEqual([3, 3]);
    expect(graph.nodes.T.attachedTo).toBe('A');
    expect(graph.nodes.A.boundaryEvents).toEqual(['T']);
    expect(Object.values(graph.messageFlows)).toHaveLength(1);
  });

  it('nests expanded sub-processes as separate scopes', async () => {
    const { graph, warnings } = await graphOf({
      nodes: [
        { id: 'S', type: 'startEvent', at: [0, 0] },
        { id: 'SP', type: 'subProcess', name: 'Handle', at: [2, 0] },
        { id: 'SS', type: 'startEvent', at: [1.2, 0], parent: 'SP' },
        { id: 'ST', type: 'task', name: 'Inner', at: [2, 0], parent: 'SP' },
        { id: 'SE', type: 'endEvent', at: [2.8, 0], parent: 'SP' },
        { id: 'E', type: 'endEvent', at: [4, 0] }
      ],
      flows: [
        { from: 'S', to: 'SP' },
        { from: 'SS', to: 'ST' },
        { from: 'ST', to: 'SE' },
        { from: 'SP', to: 'E' }
      ]
    });
    expect(warnings).toEqual([]);
    expect(graph.scopes.SP.kind).toBe('subProcess');
    expect(graph.scopes.SP.nodeIds).toEqual(['SS', 'ST', 'SE']);
    expect(graph.nodes.ST.scopeId).toBe('SP');
    const analysis = analyseModel(graph);
    expect(analysis.sound).toBe(true);
    expect(analysis.scopes).toHaveLength(2);
  });
});

describe('behavioral analysis', () => {
  it('accepts a sequence as sound', async () => {
    const { graph } = await graphOf(SEQUENCE);
    const a = analyseScope(graph, 'Process_1');
    expect(a.sound).toBe(true);
    expect(a.deadlocks).toEqual([]);
  });

  it.each([
    ['exclusiveGateway', 'exclusiveGateway'],
    ['parallelGateway', 'parallelGateway'],
    ['inclusiveGateway', 'inclusiveGateway']
  ] as const)('accepts matched %s / %s', async (split, join) => {
    const { graph } = await graphOf(splitJoin(split, join));
    const a = analyseScope(graph, 'Process_1');
    expect(a.sound).toBe(true);
  });

  it('detects a deadlock for XOR split closed by AND join', async () => {
    const { graph } = await graphOf(splitJoin('exclusiveGateway', 'parallelGateway'));
    const a = analyseScope(graph, 'Process_1');
    expect(a.sound).toBe(false);
    expect(a.deadlocks.length).toBeGreaterThan(0);
    expect(a.deadlocks[0].stuck[0].targetId).toBe('G2');
    expect(a.deadlocks[0].stuck[0].missingFlows.length).toBe(1);
    expect(a.deadNodeIds).toEqual(['G2', 'C', 'E']);
    // witness trace starts with the start event
    expect(a.deadlocks[0].trace[0].nodeId).toBe('S');
  });

  it('detects lack of synchronization for AND split closed by XOR join', async () => {
    const { graph } = await graphOf(splitJoin('parallelGateway', 'exclusiveGateway'));
    const a = analyseScope(graph, 'Process_1');
    expect(a.sound).toBe(false);
    expect(a.deadlocks).toEqual([]);
    expect(a.unsafe.map((u) => u.flowId)).toContain('fc');
  });

  it('detects a loop without exit as livelock', async () => {
    const { graph } = await graphOf({
      nodes: [
        { id: 'S', type: 'startEvent', at: [0, 0] },
        { id: 'M', type: 'exclusiveGateway', at: [1, 0] },
        { id: 'A', type: 'task', name: 'Rework', at: [2, 0] },
        { id: 'E', type: 'endEvent', at: [3, 1] }
      ],
      flows: [
        { from: 'S', to: 'M' },
        { from: 'M', to: 'A' },
        { from: 'A', to: 'M', route: 'below' }
      ]
    });
    const a = analyseScope(graph, 'Process_1');
    expect(a.livelocks).toHaveLength(1);
    expect(a.livelocks[0].loopNodeIds.sort()).toEqual(['A', 'M']);
    expect(a.deadNodeIds).toContain('E');
  });

  it('accepts a loop with an exit', async () => {
    const { graph } = await graphOf({
      nodes: [
        { id: 'S', type: 'startEvent', at: [0, 0] },
        { id: 'M', type: 'exclusiveGateway', at: [1, 0] },
        { id: 'A', type: 'task', name: 'Review', at: [2, 0] },
        { id: 'D', type: 'exclusiveGateway', name: 'OK?', at: [3, 0] },
        { id: 'E', type: 'endEvent', at: [4, 0] }
      ],
      flows: [
        { from: 'S', to: 'M' },
        { from: 'M', to: 'A' },
        { from: 'A', to: 'D' },
        { from: 'D', to: 'E', name: 'yes' },
        { from: 'D', to: 'M', name: 'no', route: 'below' }
      ]
    });
    expect(analyseScope(graph, 'Process_1').sound).toBe(true);
  });

  it('handles terminate end events and boundary events', async () => {
    const { graph } = await graphOf({
      nodes: [
        { id: 'S', type: 'startEvent', at: [0, 0] },
        { id: 'P', type: 'parallelGateway', at: [1, 0] },
        { id: 'A', type: 'task', name: 'A', at: [2, -0.6] },
        { id: 'B', type: 'task', name: 'B', at: [2, 0.6] },
        { id: 'T', type: 'boundaryEvent', event: 'timer', attachedTo: 'B', at: [2, 0.6] },
        { id: 'EA', type: 'endEvent', at: [3, -0.6] },
        { id: 'EB', type: 'endEvent', at: [3, 0.6] },
        { id: 'X', type: 'endEvent', event: 'terminate', at: [3, 1.6] }
      ],
      flows: [
        { from: 'S', to: 'P' },
        { from: 'P', to: 'A' },
        { from: 'P', to: 'B' },
        { from: 'A', to: 'EA' },
        { from: 'B', to: 'EB' },
        { from: 'T', to: 'X' }
      ]
    });
    const a = analyseScope(graph, 'Process_1');
    expect(a.sound).toBe(true);
    expect(a.firedNodeIds).toContain('T');
  });

  it('reports unreachable activities as dead', async () => {
    const { graph } = await graphOf({
      nodes: [
        { id: 'S', type: 'startEvent', at: [0, 0] },
        { id: 'A', type: 'task', name: 'A', at: [1, 0] },
        { id: 'E', type: 'endEvent', at: [2, 0] },
        { id: 'Z', type: 'task', name: 'Orphan', at: [1, 1] },
        { id: 'E2', type: 'endEvent', at: [2, 1] }
      ],
      flows: [
        { from: 'S', to: 'A' },
        { from: 'A', to: 'E' },
        { from: 'Z', to: 'E2' }
      ]
    });
    const a = analyseScope(graph, 'Process_1');
    expect(a.deadNodeIds.sort()).toEqual(['E2', 'Z']);
  });
});

describe('token game', () => {
  it('follows chosen exclusive branches', async () => {
    const { graph } = await graphOf(splitJoin('exclusiveGateway', 'exclusiveGateway'));
    const r = runTokenGame(graph, 'Process_1', { choices: { G1: ['fb'] } });
    expect(r.completed).toBe(true);
    expect(r.trace).toEqual(['S', 'G1', 'B', 'G2', 'C', 'E']);
  });

  it('runs both parallel branches and synchronizes', async () => {
    const { graph } = await graphOf(splitJoin('parallelGateway', 'parallelGateway'));
    const r = runTokenGame(graph, 'Process_1');
    expect(r.completed).toBe(true);
    expect(r.trace.filter((id) => id === 'C')).toHaveLength(1);
    expect(r.trace).toContain('A');
    expect(r.trace).toContain('B');
  });

  it('reports blocked tokens', async () => {
    const { graph } = await graphOf(splitJoin('exclusiveGateway', 'parallelGateway'));
    const r = runTokenGame(graph, 'Process_1', { choices: { G1: ['fa'] } });
    expect(r.completed).toBe(false);
    expect(r.blockedAt[0].targetId).toBe('G2');
  });
});
