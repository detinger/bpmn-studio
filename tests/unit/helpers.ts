import { buildBpmnXml, type DiagramSpec } from '../../src/domain/bpmn/builder';
import { parseBpmnXml } from '../../src/domain/bpmn/parse';

export async function graphOf(spec: DiagramSpec) {
  const xml = buildBpmnXml(spec);
  const parsed = await parseBpmnXml(xml);
  return { xml, ...parsed };
}

/** start -> A -> end */
export const SEQUENCE: DiagramSpec = {
  nodes: [
    { id: 'S', type: 'startEvent', name: 'Order received', at: [0, 0] },
    { id: 'A', type: 'task', name: 'Check order', at: [1, 0] },
    { id: 'B', type: 'task', name: 'Ship order', at: [2, 0] },
    { id: 'E', type: 'endEvent', name: 'Order shipped', at: [3, 0] }
  ],
  flows: [
    { from: 'S', to: 'A' },
    { from: 'A', to: 'B' },
    { from: 'B', to: 'E' }
  ]
};

export function splitJoin(split: 'exclusiveGateway' | 'parallelGateway' | 'inclusiveGateway', join: 'exclusiveGateway' | 'parallelGateway' | 'inclusiveGateway'): DiagramSpec {
  return {
    nodes: [
      { id: 'S', type: 'startEvent', at: [0, 0] },
      { id: 'G1', type: split, name: 'Split', at: [1, 0] },
      { id: 'A', type: 'task', name: 'Task A', at: [2, -0.6] },
      { id: 'B', type: 'task', name: 'Task B', at: [2, 0.6] },
      { id: 'G2', type: join, name: 'Join', at: [3, 0] },
      { id: 'C', type: 'task', name: 'Task C', at: [4, 0] },
      { id: 'E', type: 'endEvent', at: [5, 0] }
    ],
    flows: [
      { id: 'f0', from: 'S', to: 'G1' },
      { id: 'fa', from: 'G1', to: 'A', name: 'a' },
      { id: 'fb', from: 'G1', to: 'B', name: 'b' },
      { id: 'fa2', from: 'A', to: 'G2' },
      { id: 'fb2', from: 'B', to: 'G2' },
      { id: 'fc', from: 'G2', to: 'C' },
      { id: 'fe', from: 'C', to: 'E' }
    ]
  };
}
