import type { Concept } from './types';
import type { DiagramSpec } from '../../domain/bpmn/builder';
import { splitJoin } from '../encyclopedia/patterns';

const eventRace: DiagramSpec = {
  nodes: [
    { id: 'Start', type: 'startEvent', name: 'Offer sent', at: [0, 0] },
    { id: 'Gw', type: 'eventBasedGateway', at: [1, 0] },
    { id: 'Msg', type: 'intermediateCatchEvent', event: 'message', name: 'Order received', at: [2, -0.8] },
    { id: 'Tmr', type: 'intermediateCatchEvent', event: 'timer', timer: 'P14D', name: '14 days', at: [2, 0.8] },
    { id: 'A', type: 'task', name: 'Process order', at: [3, -0.8] },
    { id: 'B', type: 'task', name: 'Close offer', at: [3, 0.8] },
    { id: 'E1', type: 'endEvent', name: 'Order processed', at: [4, -0.8] },
    { id: 'E2', type: 'endEvent', name: 'Offer expired', at: [4, 0.8] }
  ],
  flows: [
    { from: 'Start', to: 'Gw' },
    { from: 'Gw', to: 'Msg' },
    { from: 'Gw', to: 'Tmr' },
    { from: 'Msg', to: 'A' },
    { from: 'Tmr', to: 'B' },
    { from: 'A', to: 'E1' },
    { from: 'B', to: 'E2' }
  ]
};

const reworkLoop: DiagramSpec = {
  nodes: [
    { id: 'Start', type: 'startEvent', name: 'Article submitted', at: [0, 0] },
    { id: 'Merge', type: 'exclusiveGateway', at: [1, 0] },
    { id: 'Review', type: 'task', name: 'Review article', at: [2, 0] },
    { id: 'Ok', type: 'exclusiveGateway', name: 'Accepted?', at: [3, 0] },
    { id: 'Publish', type: 'task', name: 'Publish article', at: [4, 0] },
    { id: 'End', type: 'endEvent', name: 'Article published', at: [5, 0] },
    { id: 'Revise', type: 'task', name: 'Revise article', at: [2, 1.3] }
  ],
  flows: [
    { from: 'Start', to: 'Merge' },
    { from: 'Merge', to: 'Review' },
    { from: 'Review', to: 'Ok' },
    { id: 'Flow_Yes', from: 'Ok', to: 'Publish', name: 'yes' },
    { id: 'Flow_No', from: 'Ok', to: 'Revise', name: 'no', waypoints: [[610, 135], [610, 266], [510, 266]] },
    { from: 'Revise', to: 'Merge', waypoints: [[410, 266], [310, 266], [310, 135]] },
    { from: 'Publish', to: 'End' }
  ]
};

const endlessLoop: DiagramSpec = {
  nodes: [
    { id: 'Start', type: 'startEvent', name: 'Article submitted', at: [0, 0] },
    { id: 'Merge', type: 'exclusiveGateway', at: [1, 0] },
    { id: 'Review', type: 'task', name: 'Review article', at: [2, 0] },
    { id: 'Revise', type: 'task', name: 'Revise article', at: [3, 0] },
    { id: 'End', type: 'endEvent', name: 'Article published', at: [4, 0] }
  ],
  flows: [
    { from: 'Start', to: 'Merge' },
    { from: 'Merge', to: 'Review' },
    { from: 'Review', to: 'Revise' },
    { from: 'Revise', to: 'Merge', route: 'below' }
  ]
};

export const LEVEL3: Concept[] = [
  {
    id: 'or-gateway',
    title: 'Inclusive gateways',
    level: 3,
    summary: 'An inclusive gateway (OR) takes one or more paths and joins exactly those.',
    explanation: `The **inclusive gateway** (diamond with a circle) is between XOR and AND: every outgoing path whose condition is true receives a token — **one, several or all**.

The inclusive **join** is smart: it waits for all tokens that were *actually* started and can still arrive, and ignores branches that were not activated. This makes OR splits and OR joins a matching pair.

Use it when cases need a **combination** of optional steps (“blood test and/or X-ray”). If the options are mutually exclusive, prefer XOR; if all steps always happen, prefer AND — both are easier to read.`,
    example: { spec: splitJoin('inclusiveGateway', 'inclusiveGateway', { start: 'Patient arrived', split: 'Which tests?', fa: 'blood test', fb: 'X-ray', a: 'Take blood sample', b: 'Take X-ray', c: 'Diagnose', end: 'Patient diagnosed' }), caption: 'One or both tests; the OR join waits exactly for the tests that were started.' },
    demo: { spec: splitJoin('inclusiveGateway', 'inclusiveGateway', { start: 'Patient arrived', split: 'Which tests?', fa: 'blood test', fb: 'X-ray', a: 'Take blood sample', b: 'Take X-ray', c: 'Diagnose', end: 'Patient diagnosed' }), hint: 'Click the split gateway to choose the active branches (one or both), start, and watch the join.' },
    mistake: {
      spec: splitJoin('inclusiveGateway', 'parallelGateway', { start: 'Patient arrived', split: 'Which tests?', fa: 'blood test', fb: 'X-ray', a: 'Take blood sample', b: 'Take X-ray', c: 'Diagnose', end: 'Patient diagnosed' }),
      title: 'OR split closed by an AND join',
      text: 'If only the blood test is needed, the parallel join still waits for the X-ray — which never happens. Close an inclusive split with an inclusive join.'
    },
    exercise: {
      kind: 'predict',
      id: 'ex-predict-or',
      prompt: 'The patient only needs an X-ray. Which activities are executed?',
      spec: splitJoin('inclusiveGateway', 'inclusiveGateway', { start: 'Patient arrived', split: 'Which tests?', fa: 'blood test', fb: 'X-ray', a: 'Take blood sample', b: 'Take X-ray', c: 'Diagnose', end: 'Patient diagnosed' }),
      choices: { Split: ['Flow_B'] },
      candidates: ['TaskA', 'TaskB', 'TaskC'],
      explanation: 'Only the X-ray branch is active; the inclusive join does not wait for the blood test and “Diagnose” runs once.'
    },
    quiz: [
      { id: 'q1', question: 'How many outgoing paths can an inclusive split activate?', options: ['Exactly one', 'One or more', 'Always all', 'None'], correct: [1], explanation: 'Each path whose condition holds; at least one (or the default flow).' },
      { id: 'q2', question: 'Why is the inclusive join called “non-local”?', options: ['It is in another pool', 'Whether it may fire depends on tokens elsewhere in the process that could still arrive', 'It has no incoming flows', 'It is executed remotely'], correct: [1], explanation: 'It must know which branches are still running — information that is not local to the gateway.' }
    ],
    encyclopedia: ['inclusive-gateway', 'parallel-gateway', 'exclusive-gateway']
  },
  {
    id: 'event-based-gateway',
    title: 'Event-based gateways',
    level: 3,
    summary: 'The first event to occur decides the path.',
    explanation: `An **event-based gateway** makes a decision that depends on **what happens next**, not on data. It is followed by catch events (message, timer, signal, conditional) or receive tasks. The token waits at the gateway; the first event that occurs wins, the others are withdrawn.

A typical pattern is the **timeout**: wait for an answer, but only for a limited time. The data-based XOR gateway cannot do this, because at the moment of the decision the answer is not known yet.`,
    example: { spec: eventRace, caption: 'Order or timeout — whichever comes first.' },
    demo: { spec: eventRace, hint: 'Start the process, then trigger either “Order received” or “14 days”. The other alternative disappears.' },
    mistake: {
      spec: {
        nodes: [
          { id: 'Start', type: 'startEvent', name: 'Offer sent', at: [0, 0] },
          { id: 'Gw', type: 'exclusiveGateway', name: 'Answer received?', at: [1, 0] },
          { id: 'A', type: 'task', name: 'Process order', at: [2, -0.8] },
          { id: 'B', type: 'task', name: 'Close offer', at: [2, 0.8] },
          { id: 'E1', type: 'endEvent', name: 'Order processed', at: [3, -0.8] },
          { id: 'E2', type: 'endEvent', name: 'Offer expired', at: [3, 0.8] }
        ],
        flows: [
          { from: 'Start', to: 'Gw' },
          { from: 'Gw', to: 'A', name: 'yes' },
          { from: 'Gw', to: 'B', name: 'no' },
          { from: 'A', to: 'E1' },
          { from: 'B', to: 'E2' }
        ]
      },
      title: 'Asking a question nobody can answer yet',
      text: 'Right after sending the offer, the exclusive gateway asks whether the answer has arrived. It almost never has — so the offer is closed immediately. Waiting needs events; racing events need an event-based gateway.'
    },
    exercise: {
      kind: 'mcq',
      id: 'ex-ebg',
      prompt: 'Which elements may directly follow an event-based gateway?',
      options: ['A user task', 'A message intermediate catch event', 'A timer intermediate catch event', 'A receive task', 'An exclusive gateway'],
      correct: [1, 2, 3],
      explanation: 'Only catch events and receive tasks can participate in the race.'
    },
    quiz: [
      { id: 'q1', question: 'What decides the path of an event-based gateway?', options: ['A data condition', 'The first event that occurs', 'The user who started the process', 'The order of the flows in the diagram'], correct: [1], explanation: 'It is a race between events.' },
      { id: 'q2', question: 'Which pattern is typical for event-based gateways?', options: ['Four-eyes principle', 'Waiting with a timeout', 'Parallel approval', 'Rework loop'], correct: [1], explanation: 'Message vs. timer is the classic use case.' }
    ],
    encyclopedia: ['event-based-gateway', 'timer-event', 'message-event']
  },
  {
    id: 'synchronization',
    title: 'Synchronization',
    level: 3,
    summary: 'Joining gateways decide whether branches wait for each other.',
    explanation: `When paths come together, BPMN distinguishes:

- **Merge without waiting** — exclusive gateway, or several flows directly into an activity (an *uncontrolled merge*). Every token passes on its own.
- **Synchronizing join** — parallel gateway (wait for all) or inclusive gateway (wait for all activated branches).

If parallel branches are merged **without** synchronization, everything after the merge runs **several times** per case. This *lack of synchronization* is one of the most frequent modeling errors. BPMN Studio’s formal analysis detects it as “several tokens on the same flow”.

Note also: a parallel join makes the faster branch **wait** for the slower one — in a performance simulation, the duration of the parallel part equals its longest branch.`,
    example: { spec: splitJoin('parallelGateway', 'parallelGateway', { start: 'Contract signed', a: 'Create account', b: 'Order equipment', c: 'Welcome employee', end: 'Employee onboarded' }), caption: 'The AND join waits until both preparations are finished.' },
    demo: { spec: splitJoin('parallelGateway', 'parallelGateway', { start: 'Contract signed', a: 'Create account', b: 'Order equipment', c: 'Welcome employee', end: 'Employee onboarded' }), hint: 'Use step mode: the token from the first finished branch waits at the join (shown as “waiting at join” in the token list).' },
    mistake: {
      spec: {
        nodes: [
          { id: 'Start', type: 'startEvent', name: 'Contract signed', at: [0, 0] },
          { id: 'Split', type: 'parallelGateway', at: [1, 0] },
          { id: 'TaskA', type: 'task', name: 'Create account', at: [2, -0.8] },
          { id: 'TaskB', type: 'task', name: 'Order equipment', at: [2, 0.8] },
          { id: 'TaskC', type: 'task', name: 'Welcome employee', at: [3.5, 0] },
          { id: 'End', type: 'endEvent', name: 'Employee onboarded', at: [4.5, 0] }
        ],
        flows: [
          { from: 'Start', to: 'Split' },
          { from: 'Split', to: 'TaskA' },
          { from: 'Split', to: 'TaskB' },
          { from: 'TaskA', to: 'TaskC' },
          { from: 'TaskB', to: 'TaskC' },
          { from: 'TaskC', to: 'End' }
        ]
      },
      title: 'Fake join: two flows into one task',
      text: 'Both branches lead directly into “Welcome employee”. A task never waits: it starts once per arriving token — the new employee is welcomed twice. Add a parallel join before the task.'
    },
    exercise: {
      kind: 'click',
      id: 'ex-click-sync',
      prompt: 'This model welcomes employees twice. Click the element where the synchronization is missing.',
      spec: {
        nodes: [
          { id: 'Start', type: 'startEvent', name: 'Contract signed', at: [0, 0] },
          { id: 'Split', type: 'parallelGateway', at: [1, 0] },
          { id: 'TaskA', type: 'task', name: 'Create account', at: [2, -0.8] },
          { id: 'TaskB', type: 'task', name: 'Order equipment', at: [2, 0.8] },
          { id: 'Join', type: 'exclusiveGateway', at: [3, 0] },
          { id: 'TaskC', type: 'task', name: 'Welcome employee', at: [4, 0] },
          { id: 'End', type: 'endEvent', name: 'Employee onboarded', at: [5, 0] }
        ],
        flows: [
          { from: 'Start', to: 'Split' },
          { from: 'Split', to: 'TaskA' },
          { from: 'Split', to: 'TaskB' },
          { from: 'TaskA', to: 'Join' },
          { from: 'TaskB', to: 'Join' },
          { from: 'Join', to: 'TaskC' },
          { from: 'TaskC', to: 'End' }
        ]
      },
      correctIds: ['Join'],
      explanation: 'The exclusive merge lets both tokens pass. Replace it with a parallel gateway to wait for both branches.'
    },
    quiz: [
      { id: 'q1', question: 'Which constructs synchronize (wait for other branches)?', options: ['Exclusive gateway merge', 'Parallel gateway join', 'Inclusive gateway join', 'Two flows directly into a task'], correct: [1, 2], explanation: 'Only AND and OR joins wait.' },
      { id: 'q2', question: 'Branch A takes 10 minutes, branch B 30 minutes; both run in parallel and are joined. How long does the parallel part take?', options: ['10 minutes', '20 minutes', '30 minutes', '40 minutes'], correct: [2], explanation: 'The join waits for the slowest branch (assuming no waiting for resources).' }
    ],
    encyclopedia: ['parallel-gateway', 'inclusive-gateway']
  },
  {
    id: 'loops',
    title: 'Loops',
    level: 3,
    summary: 'Tokens can revisit activities — but every loop needs an exit.',
    explanation: `A **loop** sends the token back to an earlier point, so activities are executed again. Typical loops are **rework** (“revise until accepted”) and **retries**.

Model a loop with an **exclusive merge** at the loop entry and an **exclusive decision** at the end of the loop body. The decision must have an **exit**: a path that leaves the loop.

Alternatively, a single activity that repeats can carry a **loop marker** (circular arrow). In simulations, loops cause **rework**: the same work is done several times per case, increasing cycle time and cost.`,
    example: { spec: reworkLoop, caption: 'Review → revise → review again, until the article is accepted.' },
    demo: { spec: reworkLoop, hint: 'Select “no” at “Accepted?” (click the gateway) to send the token around the loop; switch to “yes” to leave it.' },
    mistake: { spec: endlessLoop, title: 'A loop without exit', text: 'After “Revise article” the token always returns to the review — there is no way to reach “Article published”. The formal analysis reports a loop without exit (livelock) and a dead end event.' },
    exercise: {
      kind: 'predict',
      id: 'ex-predict-loop',
      prompt: 'The article is rejected once and then accepted. Which activities are executed (at least once)?',
      spec: reworkLoop,
      choices: { Ok: ['Flow_No', 'Flow_Yes'] },
      candidates: ['Review', 'Revise', 'Publish'],
      explanation: 'Review (twice), Revise (once) and Publish (once).'
    },
    quiz: [
      { id: 'q1', question: 'Which gateway is used at the entry point of a loop?', options: ['Parallel join', 'Exclusive merge', 'Event-based gateway', 'None — flows go directly into the first task'], correct: [1], explanation: 'An exclusive merge combines the first arrival and the loop-back without waiting. (Flows directly into a task would work, too, but are less clear.)' },
      { id: 'q2', question: 'What is the effect of rework loops on performance?', options: ['None', 'They increase cycle time and cost per case', 'They reduce waiting times', 'They increase throughput'], correct: [1], explanation: 'Work is repeated; in the performance lab you can measure the rework rate.' }
    ],
    encyclopedia: ['loop-activity', 'exclusive-gateway']
  },
  {
    id: 'deadlocks',
    title: 'Deadlocks',
    level: 3,
    summary: 'A deadlock is a state in which tokens wait for something that can never happen.',
    explanation: `A **deadlock** occurs when a joining gateway waits for tokens that will **never** arrive. The case stops forever.

The classic cause is **mismatched gateways**: an exclusive split (only one branch runs) closed by a parallel join (waits for all branches). Other causes: an inclusive split closed by a parallel join, or waiting for an event that never comes.

How to find deadlocks:

1. **Token simulation** — the animation stops and BPMN Studio marks the instance as *blocked*.
2. **Formal analysis** — the validator explores *all* reachable states and reports a deadlock with the exact execution that leads to it.
3. **Performance simulation** — blocked cases never complete and are reported as incomplete instead of distorting the KPIs.

A model without deadlocks, without duplicated tokens and in which every element is reachable is called **sound**.`,
    example: { spec: splitJoin('exclusiveGateway', 'exclusiveGateway', { start: 'Order received', split: 'Express?', fa: 'yes', fb: 'no', a: 'Ship express', b: 'Ship standard', c: 'Send tracking', end: 'Order shipped' }), caption: 'Matching gateways: XOR split, XOR merge — no deadlock.' },
    demo: { spec: splitJoin('exclusiveGateway', 'parallelGateway', { start: 'Order received', split: 'Express?', fa: 'yes', fb: 'no', a: 'Ship express', b: 'Ship standard', c: 'Send tracking', end: 'Order shipped' }), hint: 'Start the simulation: the parallel join waits forever. BPMN Studio shows the instance as blocked and names the missing token.' },
    mistake: { spec: splitJoin('exclusiveGateway', 'parallelGateway', { start: 'Order received', split: 'Express?', fa: 'yes', fb: 'no', a: 'Ship express', b: 'Ship standard', c: 'Send tracking', end: 'Order shipped' }), title: 'XOR split + AND join', text: 'Only one shipping method is chosen, but the join waits for both. Replace the join by an exclusive merge.' },
    exercise: {
      kind: 'click',
      id: 'ex-click-deadlock',
      prompt: 'Click the element where the tokens get stuck.',
      spec: splitJoin('exclusiveGateway', 'parallelGateway', { start: 'Order received', split: 'Express?', fa: 'yes', fb: 'no', a: 'Ship express', b: 'Ship standard', c: 'Send tracking', end: 'Order shipped' }),
      correctIds: ['Join'],
      explanation: 'The parallel join waits for a token from both branches, but the exclusive split only started one.'
    },
    quiz: [
      { id: 'q1', question: 'Which gateway pairing causes a deadlock?', options: ['XOR split + XOR merge', 'AND split + AND join', 'XOR split + AND join', 'OR split + OR join'], correct: [2], explanation: 'The AND join waits for branches that were never started.' },
      { id: 'q2', question: 'What does the performance simulator do with deadlocked cases?', options: ['Counts them as completed', 'Reports them as incomplete and excludes them from the KPIs', 'Removes the join', 'Restarts them'], correct: [1], explanation: 'BPMN Studio never silently turns blocked cases into misleading results.' },
      { id: 'q3', question: 'Which properties does a sound process have?', options: ['Every case can complete', 'No tokens remain when a case completes', 'Every activity can be executed', 'It contains no loops'], correct: [0, 1, 2], explanation: 'Loops are fine as long as they have an exit.' }
    ],
    encyclopedia: ['parallel-gateway', 'exclusive-gateway']
  }
];
