/**
 * Guided tutorials: step-by-step modeling tasks whose steps are checked
 * automatically against the student's live model, the validation report and
 * the token simulation — completable without instructor intervention.
 */
import type { DiagramSpec } from '../domain/bpmn/builder';
import type { ProcessGraph } from '../domain/bpmn/graph';
import { analyseModel } from '../domain/bpmn/behavior';
import type { ValidationReport } from '../domain/validation/types';

export interface TutorialObservations {
  instancesCompleted: number;
  decisions: Set<string>;
  joinWaitSeen: boolean;
}

export interface TutorialContext {
  graph: ProcessGraph;
  report: ValidationReport | null;
  seen: TutorialObservations;
}

export interface TutorialStep {
  id: string;
  title: string;
  instruction: string;
  hint: string;
  check: (ctx: TutorialContext) => boolean;
}

export interface Tutorial {
  id: string;
  title: string;
  description: string;
  minutes: number;
  start?: DiagramSpec;
  steps: TutorialStep[];
}

const nodes = (g: ProcessGraph) => Object.values(g.nodes);
const named = (s: string) => s.trim().length > 0;
const twoWords = (s: string) => s.trim().split(/\s+/).length >= 2;
const activities = (g: ProcessGraph) => nodes(g).filter((n) => n.kind === 'activity');
const soundAndClean = (ctx: TutorialContext) => {
  const a = analyseModel(ctx.graph);
  return a.scopes.length > 0 && a.sound && (ctx.report ? ctx.report.counts.error === 0 : false);
};

export const TUTORIALS: Tutorial[] = [
  {
    id: 'first-process',
    title: 'Your first process',
    description: 'Model a small process from start to end, validate it and watch it run.',
    minutes: 10,
    steps: [
      {
        id: 'start',
        title: 'Add a start event',
        instruction: 'Every process begins with a start event. The diagram already contains one — give it a name that describes the trigger, e.g. “Order received”.',
        hint: 'Double-click the circle on the canvas to edit its label.',
        check: ({ graph }) => nodes(graph).some((n) => n.kind === 'start' && named(n.name))
      },
      {
        id: 'task1',
        title: 'Add a task',
        instruction: 'Add a task after the start event and name it with a verb and an object, e.g. “Check order”.',
        hint: 'Select the start event and use the rounded-rectangle icon in its context pad, or drag a task from the palette on the left.',
        check: ({ graph }) => activities(graph).some((a) => twoWords(a.name))
      },
      {
        id: 'task2',
        title: 'Add a second task',
        instruction: 'Add another task that follows the first one, e.g. “Ship order”.',
        hint: 'Append it from the context pad of the first task — the sequence flow is created automatically.',
        check: ({ graph }) => activities(graph).filter((a) => twoWords(a.name)).length >= 2
      },
      {
        id: 'end',
        title: 'Add an end event',
        instruction: 'Finish the process with a named end event describing the outcome, e.g. “Order shipped”.',
        hint: 'The end event has a thick border. Append it to the last task.',
        check: ({ graph }) => nodes(graph).some((n) => n.kind === 'end' && named(n.name))
      },
      {
        id: 'connected',
        title: 'Connect everything',
        instruction: 'Make sure that every element lies on a path from the start event to the end event.',
        hint: 'Open the Issues panel: disconnected or unreachable elements are listed there.',
        check: (ctx) => {
          const a = analyseModel(ctx.graph);
          return a.scopes.length > 0 && a.scopes.every((s) => s.canComplete && s.deadNodeIds.length === 0);
        }
      },
      {
        id: 'valid',
        title: 'Validate your model',
        instruction: 'Open the Issues panel. Fix all errors until none are left. Recommendations are optional.',
        hint: 'Click a finding to see where it is and how to correct it.',
        check: soundAndClean
      },
      {
        id: 'simulate',
        title: 'Run the token simulation',
        instruction: 'Open the “Simulate” tab, enter simulation mode and start an instance. Let the token run until the end event.',
        hint: 'Press “Enter simulation mode”, then “Start instance”.',
        check: ({ seen }) => seen.instancesCompleted >= 1
      }
    ]
  },
  {
    id: 'decisions',
    title: 'Decisions with an exclusive gateway',
    description: 'Model a decision with a question, labeled outcomes and one end event per outcome.',
    minutes: 12,
    start: {
      nodes: [
        { id: 'StartEvent_1', type: 'startEvent', name: 'Application received', at: [0, 0] },
        { id: 'Task_Check', type: 'userTask', name: 'Check application', at: [1, 0] }
      ],
      flows: [{ from: 'StartEvent_1', to: 'Task_Check' }]
    },
    steps: [
      {
        id: 'gateway',
        title: 'Add an exclusive gateway',
        instruction: 'Append an exclusive gateway to “Check application” and label it with a question, e.g. “Application complete?”.',
        hint: 'Gateways are diamonds. Questions end with a question mark.',
        check: ({ graph }) => nodes(graph).some((n) => n.gateway === 'exclusive' && /\?\s*$/.test(n.name))
      },
      {
        id: 'outcomes',
        title: 'Two labeled outcomes',
        instruction: 'Draw two outgoing paths from the gateway and label each sequence flow with an answer, e.g. “yes” and “no”.',
        hint: 'Double-click a sequence flow to give it a label.',
        check: ({ graph }) =>
          nodes(graph).some((n) => n.gateway === 'exclusive' && n.outgoing.length >= 2 && n.outgoing.every((f) => named(graph.flows[f].name) || graph.flows[f].isDefault))
      },
      {
        id: 'paths',
        title: 'Complete both paths',
        instruction: 'Add an activity to each path (e.g. “Assess application”, “Request documents”) and finish each path with its own named end event.',
        hint: 'Separate end events make the outcomes visible.',
        check: ({ graph }) => nodes(graph).filter((n) => n.kind === 'end' && named(n.name)).length >= 2 && activities(graph).length >= 3
      },
      {
        id: 'valid',
        title: 'Sound and valid',
        instruction: 'Check the Issues panel: the control flow must be verified and there must be no errors.',
        hint: 'Every element must be reachable and every path must end in an end event.',
        check: soundAndClean
      },
      {
        id: 'both-paths',
        title: 'Simulate both outcomes',
        instruction: 'In the token simulation, run one instance through each path. Change the route in the “Gateway routes” list or by clicking the gateway.',
        hint: 'The decision log in the Simulate tab shows which paths were taken.',
        check: ({ graph, seen }) => nodes(graph).some((n) => n.gateway === 'exclusive' && n.outgoing.length >= 2 && n.outgoing.every((f) => seen.decisions.has(f)))
      }
    ]
  },
  {
    id: 'parallel',
    title: 'Parallel work and synchronization',
    description: 'Let two activities run concurrently and synchronize them with a parallel join.',
    minutes: 12,
    start: {
      nodes: [
        { id: 'StartEvent_1', type: 'startEvent', name: 'Order accepted', at: [0, 0] },
        { id: 'EndEvent_1', type: 'endEvent', name: 'Order shipped', at: [6, 0] }
      ],
      flows: []
    },
    steps: [
      {
        id: 'split',
        title: 'Parallel split',
        instruction: 'After the start event, add a parallel gateway (+) with two outgoing paths.',
        hint: 'Change a gateway’s type with the wrench icon in its context pad.',
        check: ({ graph }) => nodes(graph).some((n) => n.gateway === 'parallel' && n.outgoing.length >= 2)
      },
      {
        id: 'branches',
        title: 'Concurrent activities',
        instruction: 'Put one task on each path, e.g. “Pack goods” and “Send invoice”.',
        hint: 'Parallel gateways have no labels or conditions on their outgoing flows.',
        check: ({ graph }) => activities(graph).filter((a) => twoWords(a.name)).length >= 2
      },
      {
        id: 'join',
        title: 'Synchronize',
        instruction: 'Join both paths with a second parallel gateway before the next step (e.g. “Ship order”), then connect it to the end event.',
        hint: 'A parallel join has several incoming flows and one outgoing flow.',
        check: ({ graph }) => nodes(graph).some((n) => n.gateway === 'parallel' && n.incoming.length >= 2)
      },
      {
        id: 'valid',
        title: 'Sound and valid',
        instruction: 'The Issues panel must show a verified control flow without errors.',
        hint: 'If the analysis reports missing synchronization, check the type of the joining gateway.',
        check: soundAndClean
      },
      {
        id: 'observe',
        title: 'Watch the join wait',
        instruction: 'In the token simulation, enable step mode and complete only one of the parallel activities. Observe the token waiting at the join.',
        hint: 'The token list shows “waiting at join”.',
        check: ({ seen }) => seen.joinWaitSeen
      }
    ]
  }
];

export function getTutorial(id: string): Tutorial | undefined {
  return TUTORIALS.find((t) => t.id === id);
}
