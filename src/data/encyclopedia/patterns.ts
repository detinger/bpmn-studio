/** Small diagram patterns used by the encyclopedia and lessons. */
import type { DiagramSpec, NodeSpec, FlowSpec } from '../../domain/bpmn/builder';

type N = Omit<NodeSpec, 'at'> & { at?: [number, number] };

/** Lay out nodes left to right on row 0 and connect them in order. */
export function chain(nodes: N[], extra: Partial<DiagramSpec> = {}): DiagramSpec {
  const placed = nodes.map((n, i) => ({ ...n, at: n.at ?? ([i, 0] as [number, number]) })) as NodeSpec[];
  const flows: FlowSpec[] = [];
  for (let i = 0; i < placed.length - 1; i++) flows.push({ from: placed[i].id, to: placed[i + 1].id });
  return { nodes: [...placed, ...(extra.nodes ?? [])], flows: [...flows, ...(extra.flows ?? [])], ...omit(extra, ['nodes', 'flows']) };
}

function omit<T extends object>(o: T, keys: string[]): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))) as Partial<T>;
}

/** start → split → (A | B) → join → C → end */
export function splitJoin(
  split: NodeSpec['type'],
  join: NodeSpec['type'],
  labels: { split?: string; a?: string; b?: string; c?: string; fa?: string; fb?: string; start?: string; end?: string } = {}
): DiagramSpec {
  return {
    nodes: [
      { id: 'Start', type: 'startEvent', name: labels.start ?? 'Start', at: [0, 0] },
      { id: 'Split', type: split, name: labels.split, at: [1, 0] },
      { id: 'TaskA', type: 'task', name: labels.a ?? 'Task A', at: [2, -0.8] },
      { id: 'TaskB', type: 'task', name: labels.b ?? 'Task B', at: [2, 0.8] },
      { id: 'Join', type: join, at: [3, 0] },
      { id: 'TaskC', type: 'task', name: labels.c ?? 'Task C', at: [4, 0] },
      { id: 'End', type: 'endEvent', name: labels.end ?? 'End', at: [5, 0] }
    ],
    flows: [
      { id: 'Flow_Start', from: 'Start', to: 'Split' },
      { id: 'Flow_A', from: 'Split', to: 'TaskA', name: labels.fa },
      { id: 'Flow_B', from: 'Split', to: 'TaskB', name: labels.fb },
      { id: 'Flow_A2', from: 'TaskA', to: 'Join' },
      { id: 'Flow_B2', from: 'TaskB', to: 'Join' },
      { id: 'Flow_C', from: 'Join', to: 'TaskC' },
      { id: 'Flow_End', from: 'TaskC', to: 'End' }
    ]
  };
}

/** start → split → (A → endA | B → endB) */
export function decision(
  gateway: NodeSpec['type'],
  labels: { gateway?: string; a?: string; b?: string; fa?: string; fb?: string; start?: string; endA?: string; endB?: string; before?: string } = {}
): DiagramSpec {
  const before = labels.before ? [{ id: 'TaskBefore', type: 'task' as const, name: labels.before, at: [1, 0] as [number, number] }] : [];
  const off = before.length;
  return {
    nodes: [
      { id: 'Start', type: 'startEvent', name: labels.start ?? 'Start', at: [0, 0] },
      ...before,
      { id: 'Gateway', type: gateway, name: labels.gateway, at: [1 + off, 0] },
      { id: 'TaskA', type: 'task', name: labels.a ?? 'Task A', at: [2 + off, -0.8] },
      { id: 'TaskB', type: 'task', name: labels.b ?? 'Task B', at: [2 + off, 0.8] },
      { id: 'EndA', type: 'endEvent', name: labels.endA ?? 'End A', at: [3 + off, -0.8] },
      { id: 'EndB', type: 'endEvent', name: labels.endB ?? 'End B', at: [3 + off, 0.8] }
    ],
    flows: [
      ...(before.length ? [{ from: 'Start', to: 'TaskBefore' }, { from: 'TaskBefore', to: 'Gateway' }] : [{ from: 'Start', to: 'Gateway' }]),
      { id: 'Flow_A', from: 'Gateway', to: 'TaskA', name: labels.fa },
      { id: 'Flow_B', from: 'Gateway', to: 'TaskB', name: labels.fb },
      { from: 'TaskA', to: 'EndA' },
      { from: 'TaskB', to: 'EndB' }
    ]
  };
}
