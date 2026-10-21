import type { Concept } from './types';
import { chain, decision, splitJoin } from '../encyclopedia/patterns';

export const LEVEL1: Concept[] = [
  {
    id: 'process-basics',
    title: 'Processes and activities',
    level: 1,
    summary: 'A process is a sequence of activities that turns a trigger into a business outcome.',
    explanation: `A **business process** describes how an organization reacts to a trigger (an order, an application, a complaint) and reaches a result. In BPMN, the work itself is shown as **activities** — rounded rectangles.

An activity that is not broken down further is a **task**. Name tasks with a **verb and an object**: “Check invoice”, “Approve request”, “Ship goods”. A single noun (“Invoice”) says what is involved, but not what is done.

Every execution of a process is a **process instance** (a *case*): one order, one application. BPMN describes all cases at once — the diagram is the recipe, each instance is one meal cooked from it.`,
    example: {
      spec: chain([
        { id: 'Start', type: 'startEvent', name: 'Invoice received' },
        { id: 'Check', type: 'task', name: 'Check invoice' },
        { id: 'Approve', type: 'task', name: 'Approve invoice' },
        { id: 'Pay', type: 'task', name: 'Pay invoice' },
        { id: 'End', type: 'endEvent', name: 'Invoice paid' }
      ]),
      caption: 'Three tasks named verb–object, between a trigger and an outcome.'
    },
    demo: {
      spec: chain([
        { id: 'Start', type: 'startEvent', name: 'Invoice received' },
        { id: 'Check', type: 'task', name: 'Check invoice' },
        { id: 'Approve', type: 'task', name: 'Approve invoice' },
        { id: 'Pay', type: 'task', name: 'Pay invoice' },
        { id: 'End', type: 'endEvent', name: 'Invoice paid' }
      ]),
      hint: 'Press Start: one token represents one invoice moving through the process. Press Start again to create a second instance.'
    },
    mistake: {
      spec: chain([
        { id: 'Start', type: 'startEvent', name: 'Start' },
        { id: 'A', type: 'task', name: 'Invoice' },
        { id: 'B', type: 'task', name: 'Manager' },
        { id: 'C', type: 'task', name: 'Payment?' },
        { id: 'End', type: 'endEvent', name: 'End' }
      ]),
      title: 'Labels that do not describe work',
      text: '“Invoice”, “Manager” and “Payment?” name objects, roles and questions — not activities. Readers cannot tell what happens. Rename them “Check invoice”, “Approve invoice”, “Pay invoice”, and name the events after business states (“Invoice received”, “Invoice paid”).'
    },
    exercise: {
      kind: 'mcq',
      id: 'ex-naming',
      prompt: 'Which of these is the best name for a task?',
      options: ['Credit check', 'Check creditworthiness', 'Creditworthiness OK?', 'Bank'],
      correct: [1],
      explanation: '“Check creditworthiness” is verb–object. “Credit check” is a noun phrase, “…OK?” is a question (a gateway label) and “Bank” is a participant.'
    },
    quiz: [
      {
        id: 'q1',
        question: 'What is a process instance?',
        options: ['The diagram of a process', 'One concrete execution of a process, e.g. one order', 'A department that runs the process', 'A step inside the process'],
        correct: [1],
        explanation: 'The model describes all cases; an instance is a single case handled according to the model.'
      },
      {
        id: 'q2',
        question: 'How are activities drawn in BPMN?',
        options: ['Circles', 'Diamonds', 'Rounded rectangles', 'Dashed arrows'],
        correct: [2],
        explanation: 'Circles are events, diamonds are gateways, dashed arrows are message flows.'
      },
      {
        id: 'q3',
        question: 'Which statements about tasks are true?',
        options: ['A task is an atomic activity', 'Tasks should be named verb–object', 'A task can only be performed by a person', 'A task always has exactly one outgoing flow'],
        correct: [0, 1],
        explanation: 'Tasks can also be automated (service, script tasks). They may have several outgoing flows (implicit parallel split), though gateways are clearer.'
      }
    ],
    encyclopedia: ['task', 'user-task', 'service-task']
  },
  {
    id: 'events-basics',
    title: 'Events',
    level: 1,
    summary: 'Events are things that happen: they start, interrupt or end a process.',
    explanation: `**Events** are circles. Unlike activities, they take no time — they *happen*.

- A **start event** (thin border) triggers a new process instance. Name it after the trigger in the past tense: “Order received”.
- An **end event** (thick border) marks an outcome: “Order shipped”, “Order rejected”. A process can and usually should have several end events — one per business outcome.
- **Intermediate events** (double border) happen during the process: waiting for a message, a timer, a milestone.

A symbol inside the circle shows the **trigger or result**: envelope = message, clock = timer, lightning = error. An empty circle is a “none” event. Catching events have white symbols; throwing events have black ones.`,
    example: {
      spec: decision('exclusiveGateway', { start: 'Order received', gateway: 'In stock?', fa: 'yes', fb: 'no', a: 'Ship order', b: 'Inform customer', endA: 'Order shipped', endB: 'Order cancelled' }),
      caption: 'One trigger, two distinct outcomes, each with its own end event.'
    },
    demo: {
      spec: chain([
        { id: 'Start', type: 'startEvent', event: 'message', name: 'Order received' },
        { id: 'A', type: 'task', name: 'Ship order' },
        { id: 'Wait', type: 'intermediateCatchEvent', event: 'message', name: 'Payment received' },
        { id: 'B', type: 'task', name: 'Close order' },
        { id: 'End', type: 'endEvent', name: 'Order closed' }
      ]),
      hint: 'Start the process. The token waits at “Payment received” until you trigger the event with its play button.'
    },
    mistake: {
      spec: chain([
        { id: 'Start', type: 'startEvent', name: 'Receive order' },
        { id: 'A', type: 'task', name: 'Ship order' },
        { id: 'End', type: 'endEvent', name: 'Finish' }
      ]),
      title: 'Events named like activities',
      text: '“Receive order” and “Finish” sound like work. Events describe states that are reached: “Order received”, “Order shipped”. The difference matters: an activity takes time and resources, an event does not.'
    },
    exercise: {
      kind: 'click',
      id: 'ex-click-end',
      prompt: 'Click the element that represents the business outcome “goods are on their way”.',
      spec: decision('exclusiveGateway', { start: 'Order received', gateway: 'In stock?', fa: 'yes', fb: 'no', a: 'Ship order', b: 'Inform customer', endA: 'Order shipped', endB: 'Order cancelled' }),
      correctIds: ['EndA'],
      explanation: 'The end event “Order shipped” is the outcome. “Ship order” is the activity that leads to it.'
    },
    quiz: [
      {
        id: 'q1',
        question: 'Which border does an end event have?',
        options: ['A thin single border', 'A double border', 'A thick single border', 'A dashed border'],
        correct: [2],
        explanation: 'Start: thin; intermediate: double; end: thick. Dashed borders mark non-interrupting events.'
      },
      {
        id: 'q2',
        question: 'A process has two parallel branches. One branch reaches a (normal) end event. What happens?',
        options: ['The whole process ends immediately', 'Only that branch ends; the instance completes when all tokens are consumed', 'An error occurs', 'The other branch is restarted'],
        correct: [1],
        explanation: 'A normal end event consumes only its own token. Only a terminate end event stops all branches.'
      },
      {
        id: 'q3',
        question: 'What does a white (unfilled) envelope in an intermediate event mean?',
        options: ['A message is sent', 'A message is received (waited for)', 'An e-mail task', 'A data object'],
        correct: [1],
        explanation: 'Unfilled symbols catch, filled symbols throw.'
      }
    ],
    encyclopedia: ['start-event', 'end-event', 'intermediate-catch-event', 'intermediate-throw-event']
  },
  {
    id: 'sequence-flows',
    title: 'Sequence flows',
    level: 1,
    summary: 'Sequence flows define the order of execution — the path of the token.',
    explanation: `A **sequence flow** (solid arrow) connects two flow elements and defines that the second one happens *after* the first.

Think of a **token** as a marker that travels along the sequence flows. When an activity completes, it puts a token on its outgoing flow; the token moves to the next element, which then starts. This *token game* is the precise meaning of a BPMN diagram — the token simulation in BPMN Studio makes it visible.

Rules: sequence flows stay **inside one pool**; they do not cross sub-process borders; a start event has no incoming and an end event no outgoing sequence flow.`,
    example: {
      spec: chain([
        { id: 'Start', type: 'startEvent', name: 'Request received' },
        { id: 'A', type: 'task', name: 'Register request' },
        { id: 'B', type: 'task', name: 'Process request' },
        { id: 'End', type: 'endEvent', name: 'Request processed' }
      ]),
      caption: 'The arrows define the order: register before processing.'
    },
    demo: {
      spec: chain([
        { id: 'Start', type: 'startEvent', name: 'Request received' },
        { id: 'A', type: 'task', name: 'Register request' },
        { id: 'B', type: 'task', name: 'Process request' },
        { id: 'End', type: 'endEvent', name: 'Request processed' }
      ]),
      hint: 'Enable step mode and press Step repeatedly: each activity completes only when you allow it, and the token then follows the outgoing sequence flow.'
    },
    mistake: {
      spec: {
        nodes: [
          { id: 'Start', type: 'startEvent', name: 'Request received', at: [0, 0] },
          { id: 'A', type: 'task', name: 'Register request', at: [1, 0] },
          { id: 'B', type: 'task', name: 'Process request', at: [2, 0] },
          { id: 'End', type: 'endEvent', name: 'Request processed', at: [3, 0] }
        ],
        flows: [
          { from: 'Start', to: 'A' },
          { from: 'A', to: 'B' },
          { id: 'Dup', from: 'A', to: 'B', waypoints: [[290, 150], [290, 182], [440, 182], [440, 150]] },
          { from: 'B', to: 'End' }
        ]
      },
      title: 'Duplicate flows create duplicate work',
      text: 'Two sequence flows connect the same pair of tasks. When “Register request” completes, it puts a token on *each* outgoing flow — “Process request” is executed twice. Try it in the token simulation.'
    },
    exercise: {
      kind: 'mcq',
      id: 'ex-flow-cross',
      prompt: 'Which connection is allowed for a sequence flow?',
      options: ['From a task in pool “Customer” to a task in pool “Shop”', 'From a start event to a task in the same process', 'Into a start event', 'Out of an end event'],
      correct: [1],
      explanation: 'Sequence flows connect elements of the same process. Between pools, use message flows.'
    },
    quiz: [
      {
        id: 'q1',
        question: 'What does a token represent?',
        options: ['A user', 'The current position of one process instance (or one of its branches)', 'A data object', 'A resource'],
        correct: [1],
        explanation: 'Tokens mark where an instance is. Parallel branches of one instance have one token each.'
      },
      {
        id: 'q2',
        question: 'An activity has two outgoing sequence flows without a gateway. What happens when it completes?',
        options: ['One of them is chosen', 'Both receive a token (implicit parallel split)', 'The model is invalid and nothing happens', 'The first one drawn is taken'],
        correct: [1],
        explanation: 'Uncontrolled flow: each outgoing flow receives a token. Use explicit gateways to make this clear.'
      },
      {
        id: 'q3',
        question: 'Can a sequence flow cross the border of a pool?',
        options: ['Yes', 'No'],
        correct: [1],
        explanation: 'Different pools are different participants; they communicate with message flows only.'
      }
    ],
    encyclopedia: ['sequence-flow', 'message-flow']
  },
  {
    id: 'process-structure',
    title: 'Basic process structure',
    level: 1,
    summary: 'A well-formed process starts, ends, and every element lies on a path between them.',
    explanation: `A good process model has a clear **structure**:

1. At least one **start event** and one **end event** per process.
2. Every activity is **connected**: it lies on a path from a start event to an end event.
3. Paths that split are **joined** again with the same kind of gateway.
4. Models read **left to right** (or top to bottom), with the main path in a straight line.

Two automatic checks help: the **validator** finds disconnected or unreachable elements, and the **formal control-flow analysis** explores every possible execution to prove that every case can complete. Open the Issues panel in the modeler to see both.`,
    example: {
      spec: decision('exclusiveGateway', { start: 'Complaint received', before: 'Analyse complaint', gateway: 'Justified?', fa: 'yes', fb: 'no', a: 'Refund customer', b: 'Explain decision', endA: 'Customer refunded', endB: 'Complaint rejected' }),
      caption: 'Every element lies on a path from the start event to an end event.'
    },
    demo: {
      spec: decision('exclusiveGateway', { start: 'Complaint received', before: 'Analyse complaint', gateway: 'Justified?', fa: 'yes', fb: 'no', a: 'Refund customer', b: 'Explain decision', endA: 'Customer refunded', endB: 'Complaint rejected' }),
      hint: 'Run both paths (change the route by clicking the gateway). Each path ends in its own end event.'
    },
    mistake: {
      spec: {
        nodes: [
          { id: 'Start', type: 'startEvent', name: 'Complaint received', at: [0, 0] },
          { id: 'A', type: 'task', name: 'Analyse complaint', at: [1, 0] },
          { id: 'B', type: 'task', name: 'Refund customer', at: [2, 0] },
          { id: 'End', type: 'endEvent', name: 'Customer refunded', at: [3, 0] },
          { id: 'C', type: 'task', name: 'Send apology letter', at: [2, 1.2] }
        ],
        flows: [
          { from: 'Start', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'End' }
        ]
      },
      title: 'A disconnected activity',
      text: '“Send apology letter” is not connected. It will never be executed, and readers cannot tell when it should happen. The validator reports it as a disconnected element.'
    },
    exercise: {
      kind: 'click',
      id: 'ex-click-disconnected',
      prompt: 'Click the element that can never be executed.',
      spec: {
        nodes: [
          { id: 'Start', type: 'startEvent', name: 'Order received', at: [0, 0] },
          { id: 'A', type: 'task', name: 'Check order', at: [1, 0] },
          { id: 'B', type: 'task', name: 'Ship order', at: [2, 0] },
          { id: 'End', type: 'endEvent', name: 'Order shipped', at: [3, 0] },
          { id: 'C', type: 'task', name: 'Print label', at: [2, 1.2] },
          { id: 'End2', type: 'endEvent', name: 'Label printed', at: [3, 1.2] }
        ],
        flows: [
          { from: 'Start', to: 'A' },
          { from: 'A', to: 'B' },
          { from: 'B', to: 'End' },
          { from: 'C', to: 'End2' }
        ]
      },
      correctIds: ['C', 'End2'],
      explanation: '“Print label” has no incoming flow, so no token can ever reach it (and therefore not “Label printed” either).'
    },
    quiz: [
      {
        id: 'q1',
        question: 'What does it mean that a model is “sound”?',
        options: ['It has no layout problems', 'Every case can complete properly, without stuck or duplicated tokens, and every element can be reached', 'It uses only tasks', 'It was validated by bpmnlint'],
        correct: [1],
        explanation: 'Soundness is a behavioral property: option to complete, proper completion, no dead elements.'
      },
      {
        id: 'q2',
        question: 'How many end events should a process with three different outcomes have?',
        options: ['Exactly one', 'Three — one per outcome', 'None', 'As many as tasks'],
        correct: [1],
        explanation: 'Separate, named end events make outcomes visible and measurable.'
      }
    ],
    encyclopedia: ['start-event', 'end-event', 'sequence-flow']
  }
];

export const LEVEL2: Concept[] = [
  {
    id: 'xor-gateway',
    title: 'Exclusive gateways',
    level: 2,
    summary: 'An exclusive gateway (XOR) chooses exactly one path.',
    explanation: `A **gateway** (diamond) controls how paths split and join. The **exclusive gateway** (empty diamond or “X”) is a decision: of its outgoing paths, **exactly one** is taken.

Label the splitting gateway with a **question** (“Order valid?”) and each outgoing flow with an **answer** (“yes”, “no”). The paths are later **merged** with another exclusive gateway, which simply lets each arriving token pass — there is nothing to wait for, because only one path was active.`,
    example: {
      spec: splitJoin('exclusiveGateway', 'exclusiveGateway', { start: 'Application received', split: 'Complete?', fa: 'yes', fb: 'no', a: 'Assess application', b: 'Request documents', c: 'Archive application', end: 'Application handled' }),
      caption: 'Split with a question, labeled answers, and a merge before the common next step.'
    },
    demo: {
      spec: splitJoin('exclusiveGateway', 'exclusiveGateway', { start: 'Application received', split: 'Complete?', fa: 'yes', fb: 'no', a: 'Assess application', b: 'Request documents', c: 'Archive application', end: 'Application handled' }),
      hint: 'Click the gateway “Complete?” to switch the active path (the highlighted outgoing flow), then start. Only one branch runs.'
    },
    mistake: {
      spec: splitJoin('exclusiveGateway', 'exclusiveGateway', { start: 'Application received', a: 'Assess application', b: 'Request documents', c: 'Archive application', end: 'Application handled' }),
      title: 'A decision nobody can read',
      text: 'The gateway has no question and its flows have no answers. Which applications are assessed? The validator flags missing gateway conditions.'
    },
    exercise: {
      kind: 'predict',
      id: 'ex-predict-xor',
      prompt: 'The application is *incomplete*. Which activities are executed?',
      spec: splitJoin('exclusiveGateway', 'exclusiveGateway', { start: 'Application received', split: 'Complete?', fa: 'yes', fb: 'no', a: 'Assess application', b: 'Request documents', c: 'Archive application', end: 'Application handled' }),
      choices: { Split: ['Flow_B'] },
      candidates: ['TaskA', 'TaskB', 'TaskC'],
      explanation: '“no” leads to “Request documents”; after the merge, “Archive application” runs. “Assess application” is skipped.'
    },
    quiz: [
      {
        id: 'q1',
        question: 'How many outgoing paths does an exclusive gateway activate per token?',
        options: ['None', 'Exactly one', 'One or more', 'All'],
        correct: [1],
        explanation: 'Exclusive = exactly one.'
      },
      {
        id: 'q2',
        question: 'Two tokens arrive at an exclusive merge one after another. What happens?',
        options: ['It waits for both and emits one', 'Each token passes immediately, so two tokens leave', 'The second token is discarded', 'Deadlock'],
        correct: [1],
        explanation: 'An XOR merge does not synchronize. That is why it must only merge mutually exclusive paths.'
      },
      {
        id: 'q3',
        question: 'Where should the question “Credit OK?” be written?',
        options: ['On the splitting gateway', 'On the merging gateway', 'On the start event', 'Nowhere'],
        correct: [0],
        explanation: 'The question belongs to the split; answers go on its outgoing flows.'
      }
    ],
    encyclopedia: ['exclusive-gateway']
  },
  {
    id: 'conditional-routing',
    title: 'Conditional routing',
    level: 2,
    summary: 'Conditions on outgoing flows determine which path a case follows.',
    explanation: `Each outgoing flow of a deciding gateway carries a **condition** — in diagrams for people, a label (“amount > € 1,000”); in executable models, an expression such as \`\${amount > 1000}\`.

Good conditions are:

- **Exclusive** (for XOR): at most one can be true for any case.
- **Complete**: for every case, at least one condition is true — otherwise the token is stuck. A **default flow** covers “all other cases”.
- **Based on information available at that moment**, usually produced by the activity before the gateway (“Check amount”).

Gateways decide; they do not do work. Put the checking work into an activity before the gateway.`,
    example: {
      spec: decision('exclusiveGateway', { start: 'Expense submitted', before: 'Check amount', gateway: 'Amount?', fa: '≤ € 1,000', fb: '> € 1,000', a: 'Approve automatically', b: 'Ask manager', endA: 'Approved', endB: 'Escalated' }),
      caption: 'An activity produces the information, the gateway routes on it.'
    },
    demo: {
      spec: decision('exclusiveGateway', { start: 'Expense submitted', before: 'Check amount', gateway: 'Amount?', fa: '≤ € 1,000', fb: '> € 1,000', a: 'Approve automatically', b: 'Ask manager', endA: 'Approved', endB: 'Escalated' }),
      hint: 'Switch the route at “Amount?” and run the process for both cases.'
    },
    mistake: {
      spec: decision('exclusiveGateway', { start: 'Expense submitted', gateway: 'Check amount', fa: '< € 1,000', fb: '> € 1,000', a: 'Approve automatically', b: 'Ask manager', endA: 'Approved', endB: 'Escalated' }),
      title: 'Gaps and work inside the gateway',
      text: 'Two problems: (1) the gateway is named like an activity — gateways do not check anything themselves; (2) the conditions “< € 1,000” and “> € 1,000” leave out exactly € 1,000: such a case gets stuck. Use “≤” or a default flow.'
    },
    exercise: {
      kind: 'mcq',
      id: 'ex-conditions',
      prompt: 'Which pair of conditions is exclusive *and* complete for an amount?',
      options: ['< 100 and > 100', '≤ 100 and ≥ 100', '≤ 100 and > 100', '< 50 and > 100'],
      correct: [2],
      explanation: '“≤ 100 / > 100” covers every amount exactly once. “≥ / ≤” overlap at 100; the others leave gaps.'
    },
    quiz: [
      {
        id: 'q1',
        question: 'What happens in an execution engine if none of the conditions of an exclusive gateway is true and there is no default flow?',
        options: ['The first flow is taken', 'An exception occurs / the case is stuck', 'All flows are taken', 'The gateway is skipped'],
        correct: [1],
        explanation: 'Always make conditions complete — or add a default flow.'
      },
      {
        id: 'q2',
        question: 'Where does the information for a decision usually come from?',
        options: ['From the gateway itself', 'From an activity before the gateway', 'From the end event', 'From the pool name'],
        correct: [1],
        explanation: 'Gateways only route; an activity (e.g. “Check amount”) produces the data.'
      }
    ],
    encyclopedia: ['exclusive-gateway', 'sequence-flow']
  },
  {
    id: 'default-flows',
    title: 'Default flows',
    level: 2,
    summary: 'The default flow is taken when no other condition is true.',
    explanation: `A **default flow** is marked with a small **slash** at its start. It is taken only if none of the other outgoing conditions holds — the “otherwise” or “else” case.

Default flows make decisions **robust**: even unforeseen cases have a defined path. There can be at most one default flow per gateway, and it has no condition of its own.

In BPMN Studio’s performance simulation, the default flow of an inclusive gateway is used when none of the probabilistic branches was selected.`,
    example: {
      spec: (() => {
        const d = decision('exclusiveGateway', { start: 'Ticket created', gateway: 'Category?', fa: 'technical', fb: 'otherwise', a: 'Route to IT', b: 'Route to service desk', endA: 'Routed to IT', endB: 'Routed to service desk' });
        d.flows = d.flows.map((f) => (f.id === 'Flow_B' ? { ...f, default: true } : f.id === 'Flow_A' ? { ...f, condition: '${category == "technical"}' } : f));
        return d;
      })(),
      caption: 'The slash marks the default (“otherwise”) flow.'
    },
    demo: {
      spec: (() => {
        const d = decision('exclusiveGateway', { start: 'Ticket created', gateway: 'Category?', fa: 'technical', fb: 'otherwise', a: 'Route to IT', b: 'Route to service desk', endA: 'Routed to IT', endB: 'Routed to service desk' });
        d.flows = d.flows.map((f) => (f.id === 'Flow_B' ? { ...f, default: true } : f.id === 'Flow_A' ? { ...f, condition: '${category == "technical"}' } : f));
        return d;
      })(),
      hint: 'Run both routes. In an engine, every ticket that is not technical takes the default flow.'
    },
    mistake: {
      spec: (() => {
        const d = decision('exclusiveGateway', { start: 'Ticket created', gateway: 'Category?', fa: 'technical', fb: 'billing', a: 'Route to IT', b: 'Route to accounting', endA: 'Routed to IT', endB: 'Routed to accounting' });
        d.flows = d.flows.map((f) => (f.id === 'Flow_A' ? { ...f, condition: '${category == "technical"}' } : f.id === 'Flow_B' ? { ...f, condition: '${category == "billing"}' } : f));
        return d;
      })(),
      title: 'No path for other cases',
      text: 'What happens to a ticket about a password reset? Neither condition is true and there is no default flow: the case is stuck. The validator recommends adding a default flow.'
    },
    exercise: {
      kind: 'mcq',
      id: 'ex-default',
      prompt: 'How many default flows can a gateway have?',
      options: ['None', 'At most one', 'Exactly two', 'One per outgoing flow'],
      correct: [1],
      explanation: 'A default flow means “otherwise” — there can only be one.'
    },
    quiz: [
      {
        id: 'q1',
        question: 'How is a default flow drawn?',
        options: ['Dashed', 'With a small slash at its start', 'With a diamond at its start', 'Thicker than other flows'],
        correct: [1],
        explanation: 'The small diamond marks a conditional flow leaving an activity; the slash marks the default flow.'
      },
      {
        id: 'q2',
        question: 'When is the default flow taken?',
        options: ['Always', 'When no other outgoing condition is true', 'When all conditions are true', 'At random'],
        correct: [1],
        explanation: 'It is the “else” branch.'
      }
    ],
    encyclopedia: ['sequence-flow', 'exclusive-gateway']
  },
  {
    id: 'and-gateway',
    title: 'Parallel gateways',
    level: 2,
    summary: 'A parallel gateway (AND) runs all paths and later waits for all of them.',
    explanation: `The **parallel gateway** (diamond with “+”) creates **concurrency**. As a split, it puts a token on *every* outgoing flow: all branches run independently. As a join, it **waits** until a token has arrived from *every* incoming flow and then continues with one token — this is **synchronization**.

**XOR vs. AND:**

- XOR split: one path. AND split: all paths.
- XOR merge: passes each token immediately. AND join: waits for all branches.
- Conditions belong on XOR (and OR) splits; on AND splits they are ignored.

Pair each split with a join of the **same type**. Mixing them causes deadlocks (XOR split → AND join) or duplicated work (AND split → XOR merge).`,
    example: {
      spec: splitJoin('parallelGateway', 'parallelGateway', { start: 'Order accepted', a: 'Pack goods', b: 'Send invoice', c: 'Ship order', end: 'Order shipped' }),
      caption: 'Packing and invoicing happen independently; shipping waits for both.'
    },
    demo: {
      spec: splitJoin('parallelGateway', 'parallelGateway', { start: 'Order accepted', a: 'Pack goods', b: 'Send invoice', c: 'Ship order', end: 'Order shipped' }),
      hint: 'Turn on step mode. After the split there are two tokens; complete only “Pack goods” and watch the join wait for “Send invoice”.'
    },
    mistake: {
      spec: splitJoin('parallelGateway', 'exclusiveGateway', { start: 'Order accepted', a: 'Pack goods', b: 'Send invoice', c: 'Ship order', end: 'Order shipped' }),
      title: 'Parallel branches merged without synchronization',
      text: 'The branches are merged with an exclusive gateway, which does not wait. Both tokens pass it, so “Ship order” is executed **twice** for one order. The formal analysis reports this as “missing synchronization”.'
    },
    exercise: {
      kind: 'predict',
      id: 'ex-predict-and',
      prompt: 'Which activities are executed for one order?',
      spec: splitJoin('parallelGateway', 'parallelGateway', { start: 'Order accepted', a: 'Pack goods', b: 'Send invoice', c: 'Ship order', end: 'Order shipped' }),
      candidates: ['TaskA', 'TaskB', 'TaskC'],
      explanation: 'All of them: the AND split activates both branches, the AND join waits for both, then “Ship order” runs once.'
    },
    quiz: [
      {
        id: 'q1',
        question: 'A parallel split has three outgoing flows. How many tokens leave it?',
        options: ['One', 'Three', 'Depends on conditions', 'None until the join'],
        correct: [1],
        explanation: 'One token per outgoing flow.'
      },
      {
        id: 'q2',
        question: 'An XOR split is closed by an AND join. What happens?',
        options: ['Everything works', 'Deadlock: the join waits for a branch that never started', 'Activities after the join run twice', 'The XOR split behaves like an AND split'],
        correct: [1],
        explanation: 'Only one branch delivers a token, but the AND join waits for all.'
      },
      {
        id: 'q3',
        question: 'Which statements are true about the parallel join?',
        options: ['It waits for one token from every incoming flow', 'It ignores late tokens', 'It emits one token after synchronization', 'It needs conditions on its incoming flows'],
        correct: [0, 2],
        explanation: 'The join synchronizes: all incoming tokens are consumed and one token continues.'
      }
    ],
    encyclopedia: ['parallel-gateway', 'exclusive-gateway']
  }
];
