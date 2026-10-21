/**
 * BPMN challenges: practical exercises with automatic, explainable assessment.
 */
import type { Challenge, CompareChallenge, DeadlockChallenge, ImproveChallenge, ModelChallenge, PredictChallenge } from '../../domain/assessment/types';
import type { DiagramSpec } from '../../domain/bpmn/builder';
import type { Distribution } from '../../domain/simulation/distributions';
import type { ResourcePoolConfig } from '../../domain/simulation/config';
import { EXAMPLES } from '../examples';
import { splitJoin } from '../encyclopedia/patterns';

export type { Challenge } from '../../domain/assessment/types';

const tri = (min: number, mode: number, max: number): Distribution => ({ type: 'triangular', min, mode, max });
const exp = (mean: number): Distribution => ({ type: 'exponential', mean });
const c = (value: number): Distribution => ({ type: 'constant', value });
const pool = (id: string, name: string, capacity: number, costPerHour: number): ResourcePoolConfig => ({ id, name, capacity, costPerHour, calendar: null, discipline: 'FIFO' });

const startOnly = (name: string): DiagramSpec => ({ nodes: [{ id: 'StartEvent_1', type: 'startEvent', name, at: [0, 0] }], flows: [] });

// ---------------------------------------------------------------------------- build

const buildOrder: ModelChallenge = {
  id: 'build-order',
  type: 'build',
  title: 'Order handling with a decision',
  level: 2,
  minutes: 15,
  summary: 'Turn a short description into a BPMN model with a decision and two outcomes.',
  scenario: `**Online shop — order handling.** When an order is received, a clerk **checks whether all items are in stock**. If they are, the warehouse **ships the order**. If not, the clerk **cancels the order**.

Model the process with one end event for each outcome.`,
  start: startOnly('Order received'),
  roles: [
    { id: 'check', label: 'Check stock', keywords: ['check', 'stock', 'availab'] },
    { id: 'ship', label: 'Ship order', keywords: ['ship', 'deliver', 'dispatch'] },
    { id: 'cancel', label: 'Cancel order', keywords: ['cancel', 'reject'] }
  ],
  criteria: [
    { kind: 'role', role: 'check' },
    { kind: 'role', role: 'ship' },
    { kind: 'role', role: 'cancel' },
    { kind: 'gateway', gateway: 'exclusive', min: 1, label: 'A decision is modeled with an exclusive gateway' },
    { kind: 'always', role: 'check' },
    { kind: 'precedes', before: 'check', after: 'ship' },
    { kind: 'precedes', before: 'check', after: 'cancel' },
    { kind: 'exclusive', roles: ['ship', 'cancel'] },
    { kind: 'endEvents', min: 2 },
    { kind: 'sound' },
    { kind: 'noErrors' }
  ],
  hints: [
    'Start with the activity that checks the stock, directly after the start event.',
    'A decision needs an exclusive gateway labeled with a question such as “All items in stock?”.',
    'Label the outgoing flows “yes” and “no”, put “Ship order” and “Cancel order” on them and end each path with its own end event.'
  ],
  concepts: ['xor-gateway', 'events-basics']
};

const buildOnboarding: ModelChallenge = {
  id: 'build-onboarding',
  type: 'build',
  title: 'Onboarding with parallel preparation',
  level: 2,
  minutes: 15,
  summary: 'Model two independent activities that run in parallel and are synchronized.',
  scenario: `**Employee onboarding.** After the employment contract is signed, HR **creates the user account** and — independently and at the same time — IT **prepares the laptop**. Only when both are done does the team lead **welcome the new employee**.`,
  start: startOnly('Contract signed'),
  roles: [
    { id: 'account', label: 'Create user account', keywords: ['account', 'credential', 'user'] },
    { id: 'laptop', label: 'Prepare laptop', keywords: ['laptop', 'equipment', 'hardware', 'computer'] },
    { id: 'welcome', label: 'Welcome employee', keywords: ['welcome', 'greet', 'introduce'] }
  ],
  criteria: [
    { kind: 'role', role: 'account' },
    { kind: 'role', role: 'laptop' },
    { kind: 'role', role: 'welcome' },
    { kind: 'gateway', gateway: 'parallel', min: 1, label: 'Concurrency is modeled with a parallel gateway' },
    { kind: 'concurrent', roles: ['account', 'laptop'] },
    { kind: 'precedes', before: 'account', after: 'welcome' },
    { kind: 'precedes', before: 'laptop', after: 'welcome' },
    { kind: 'always', role: 'welcome' },
    { kind: 'sound' },
    { kind: 'noErrors' }
  ],
  hints: [
    'Independent work that can happen at the same time is started by a parallel gateway (+).',
    '“Only when both are done” means: join the two branches with a second parallel gateway.',
    'Do not connect both branches directly to “Welcome employee” — a task does not wait for both tokens.'
  ],
  concepts: ['and-gateway', 'synchronization']
};

const buildDeadline: ModelChallenge = {
  id: 'build-deadline',
  type: 'build',
  title: 'Assessment with a deadline',
  level: 5,
  minutes: 15,
  summary: 'Model exception handling with a timer boundary event.',
  scenario: `**Insurance — expert assessment.** An expert **assesses the claim**. If the assessment is not finished within **5 days**, it is cancelled and a **senior expert takes over** the claim. In any case, the claim is finally **settled**.`,
  start: startOnly('Claim received'),
  roles: [
    { id: 'assess', label: 'Assess claim', keywords: ['assess'] },
    { id: 'senior', label: 'Senior expert takes over', keywords: ['senior', 'escalat', 'take over', 'takeover'] },
    { id: 'settle', label: 'Settle claim', keywords: ['settle', 'pay'] }
  ],
  criteria: [
    { kind: 'role', role: 'assess' },
    { kind: 'role', role: 'senior' },
    { kind: 'role', role: 'settle' },
    { kind: 'boundary', role: 'assess', event: 'timer', interrupting: true },
    { kind: 'optional', role: 'senior' },
    { kind: 'always', role: 'settle' },
    { kind: 'precedes', before: 'assess', after: 'settle' },
    { kind: 'sound' },
    { kind: 'noErrors' }
  ],
  hints: [
    'A deadline on running work is a timer event attached to the border of the activity (boundary event).',
    '“It is cancelled” means the boundary event is interrupting (solid border).',
    'Both paths — normal and escalated — lead to the settlement; merge them with an exclusive gateway before “Settle claim”.'
  ],
  concepts: ['boundary-events', 'timer-events']
};

const buildCollab: ModelChallenge = {
  id: 'build-collab',
  type: 'build',
  title: 'Purchasing with a supplier',
  level: 4,
  minutes: 20,
  summary: 'Model communication between two participants with pools and message flows.',
  scenario: `**Purchasing.** When material is needed, the purchasing department **sends a purchase order** to the supplier and waits for the supplier’s **order confirmation**. When the confirmation arrives, purchasing **books the order**.

The supplier is an independent company: model it as a separate (black-box) pool and connect the two participants with message flows.`,
  start: {
    pools: [{ id: 'Participant_Purchasing', name: 'Purchasing department', rows: [0, 0] }],
    nodes: [{ id: 'StartEvent_1', type: 'startEvent', name: 'Material needed', at: [0, 0] }],
    flows: []
  },
  roles: [
    { id: 'send', label: 'Send purchase order', keywords: ['send', 'order'], kinds: ['activity', 'event'] },
    { id: 'confirm', label: 'Order confirmation received', keywords: ['confirm'], kinds: ['activity', 'event'] },
    { id: 'book', label: 'Book order', keywords: ['book', 'record', 'register'] }
  ],
  criteria: [
    { kind: 'role', role: 'send' },
    { kind: 'role', role: 'confirm' },
    { kind: 'role', role: 'book' },
    { kind: 'pools', min: 2 },
    { kind: 'messageFlows', min: 2 },
    { kind: 'precedes', before: 'send', after: 'book' },
    { kind: 'precedes', before: 'confirm', after: 'book' },
    { kind: 'sound' },
    { kind: 'noErrors' }
  ],
  hints: [
    'Create a second pool for the supplier with the “Create pool/participant” tool of the palette. You can leave it empty (black box).',
    'Use a send task for the purchase order and a message intermediate catch event (or receive task) for the confirmation.',
    'Draw message flows between your elements and the supplier pool — never sequence flows across pools.'
  ],
  concepts: ['message-flows', 'pools-lanes']
};

// ---------------------------------------------------------------------------- fix

const fixShipping: ModelChallenge = {
  id: 'fix-shipping',
  type: 'fix',
  title: 'The stuck shipment',
  level: 3,
  minutes: 10,
  summary: 'Orders are never completed. Find and repair the modeling error.',
  scenario: `**Shipping.** Every order is shipped either by **express** or by **standard** delivery. Afterwards a **tracking number is sent** to the customer.

The current model never completes a single order. Repair it without removing any of the activities.`,
  start: (() => {
    const s = splitJoin('exclusiveGateway', 'parallelGateway', { start: 'Order packed', split: 'Express delivery?', fa: 'yes', fb: 'no', a: 'Ship express', b: 'Ship standard', c: 'Send tracking number', end: 'Order shipped' });
    return s;
  })(),
  roles: [
    { id: 'express', label: 'Ship express', keywords: ['express'] },
    { id: 'standard', label: 'Ship standard', keywords: ['standard'] },
    { id: 'tracking', label: 'Send tracking number', keywords: ['tracking'] }
  ],
  criteria: [
    { kind: 'role', role: 'express' },
    { kind: 'role', role: 'standard' },
    { kind: 'role', role: 'tracking' },
    { kind: 'exclusive', roles: ['express', 'standard'] },
    { kind: 'always', role: 'tracking' },
    { kind: 'sound' },
    { kind: 'noErrors' }
  ],
  hints: ['Run the token simulation: where does the token stop?', 'How many of the two branches are active after an exclusive split — and how many does a parallel join wait for?', 'Replace the joining gateway by an exclusive gateway.'],
  concepts: ['deadlocks', 'xor-gateway']
};

const fixSync: ModelChallenge = {
  id: 'fix-sync',
  type: 'fix',
  title: 'Shipped twice',
  level: 3,
  minutes: 10,
  summary: 'Customers receive every order twice. Find the cause.',
  scenario: `**Order fulfillment.** Goods are **packed** and the **invoice is sent** at the same time. When both are done, the order is **shipped** — exactly once.

Customers complain that they receive their orders twice. Repair the model.`,
  start: splitJoin('parallelGateway', 'exclusiveGateway', { start: 'Order accepted', a: 'Pack goods', b: 'Send invoice', c: 'Ship order', end: 'Order shipped' }),
  roles: [
    { id: 'pack', label: 'Pack goods', keywords: ['pack'] },
    { id: 'invoice', label: 'Send invoice', keywords: ['invoice'] },
    { id: 'ship', label: 'Ship order', keywords: ['ship'] }
  ],
  criteria: [
    { kind: 'role', role: 'pack' },
    { kind: 'role', role: 'invoice' },
    { kind: 'role', role: 'ship' },
    { kind: 'concurrent', roles: ['pack', 'invoice'] },
    { kind: 'precedes', before: 'pack', after: 'ship' },
    { kind: 'precedes', before: 'invoice', after: 'ship' },
    { kind: 'sound' },
    { kind: 'noErrors' }
  ],
  hints: ['Watch “Ship order” in the token simulation — how often is it executed?', 'Which gateway lets every arriving token pass without waiting?', 'Join parallel branches with a parallel gateway.'],
  concepts: ['synchronization', 'and-gateway']
};

const fixLoop: ModelChallenge = {
  id: 'fix-loop',
  type: 'fix',
  title: 'The endless review',
  level: 3,
  minutes: 10,
  summary: 'Articles are reviewed forever. Add the missing decision.',
  scenario: `**Editorial process.** Each article is **reviewed**. If the review finds problems, the author **revises the article** and it is reviewed again. Otherwise the article is **published**.

In the current model no article is ever published.`,
  start: {
    nodes: [
      { id: 'Start', type: 'startEvent', name: 'Article submitted', at: [0, 0] },
      { id: 'Merge', type: 'exclusiveGateway', at: [1, 0] },
      { id: 'Review', type: 'userTask', name: 'Review article', at: [2, 0] },
      { id: 'Revise', type: 'userTask', name: 'Revise article', at: [3, 0] },
      { id: 'Publish', type: 'task', name: 'Publish article', at: [4, 1.3] },
      { id: 'End', type: 'endEvent', name: 'Article published', at: [5, 1.3] }
    ],
    flows: [
      { from: 'Start', to: 'Merge' },
      { from: 'Merge', to: 'Review' },
      { from: 'Review', to: 'Revise' },
      { from: 'Revise', to: 'Merge', route: 'above' },
      { from: 'Publish', to: 'End' }
    ]
  },
  roles: [
    { id: 'review', label: 'Review article', keywords: ['review'] },
    { id: 'revise', label: 'Revise article', keywords: ['revise', 'rework'] },
    { id: 'publish', label: 'Publish article', keywords: ['publish'] }
  ],
  criteria: [
    { kind: 'role', role: 'review' },
    { kind: 'role', role: 'revise' },
    { kind: 'role', role: 'publish' },
    { kind: 'gateway', gateway: 'exclusive', min: 1, label: 'The review result is a decision (exclusive gateway)' },
    { kind: 'optional', role: 'revise' },
    { kind: 'always', role: 'publish' },
    { kind: 'precedes', before: 'review', after: 'publish' },
    { kind: 'sound' },
    { kind: 'noErrors' }
  ],
  hints: ['The validator reports a loop without exit and an unreachable activity. Which decision is missing?', 'After the review, add an exclusive gateway “Problems found?”.', '“yes” leads to the revision (and back to the review), “no” leads to “Publish article”.'],
  concepts: ['loops', 'xor-gateway']
};

const fixCollab: ModelChallenge = {
  id: 'fix-collab',
  type: 'fix',
  title: 'The customer is not your employee',
  level: 4,
  minutes: 20,
  summary: 'Repair a model that treats an external party as a lane.',
  scenario: `**Online shop.** A customer **places an order**; the shop’s sales team **checks the order** and **ships the goods**.

In the current model the customer is a lane of the shop’s pool, and a message flow connects two lanes. Model the customer as a separate participant instead, so that the shop’s process starts when the order message arrives.`,
  start: {
    pools: [
      {
        id: 'Participant_Shop',
        name: 'Online shop',
        rows: [0, 1],
        lanes: [
          { id: 'Lane_Customer', name: 'Customer', rows: [0, 0] },
          { id: 'Lane_Sales', name: 'Sales', rows: [1, 1] }
        ]
      }
    ],
    nodes: [
      { id: 'C_Start', type: 'startEvent', name: 'Product needed', at: [0, 0] },
      { id: 'C_Order', type: 'sendTask', name: 'Place order', at: [1, 0] },
      { id: 'C_End', type: 'endEvent', name: 'Order placed', at: [2, 0] },
      { id: 'S_Receive', type: 'receiveTask', name: 'Receive order', at: [1, 1] },
      { id: 'S_Check', type: 'userTask', name: 'Check order', at: [2, 1] },
      { id: 'S_Ship', type: 'task', name: 'Ship goods', at: [3, 1] },
      { id: 'S_End', type: 'endEvent', name: 'Goods shipped', at: [4, 1] }
    ],
    flows: [
      { from: 'C_Start', to: 'C_Order' },
      { from: 'C_Order', to: 'C_End' },
      { from: 'S_Receive', to: 'S_Check' },
      { from: 'S_Check', to: 'S_Ship' },
      { from: 'S_Ship', to: 'S_End' }
    ],
    messageFlows: [{ id: 'MessageFlow_Order', from: 'C_Order', to: 'S_Receive', name: 'order' }]
  },
  roles: [
    { id: 'check', label: 'Check order', keywords: ['check'] },
    { id: 'ship', label: 'Ship goods', keywords: ['ship'] }
  ],
  criteria: [
    { kind: 'role', role: 'check' },
    { kind: 'role', role: 'ship' },
    { kind: 'pools', min: 2 },
    { kind: 'messageFlows', min: 1 },
    { kind: 'precedes', before: 'check', after: 'ship' },
    { kind: 'sound' },
    { kind: 'noErrors' }
  ],
  hints: ['Delete the “Customer” lane and its elements, or move them to a new pool.', 'Add a (black-box) pool “Customer” above the shop.', 'Start the shop’s process with a message start event “Order received” and draw a message flow from the customer pool to it.'],
  concepts: ['pools-lanes', 'interorganizational']
};

// ---------------------------------------------------------------------------- predict

const orderExample = EXAMPLES.find((e) => e.id === 'order-fulfillment')!;
const hospitalExample = EXAMPLES.find((e) => e.id === 'hospital-admission')!;

const predictOrder: PredictChallenge = {
  id: 'predict-order',
  type: 'predict',
  title: 'Which activities run?',
  level: 2,
  minutes: 8,
  summary: 'Predict the executed activities for two situations.',
  scenario: 'Study the order process. For each situation, select every activity that is executed (at least once).',
  spec: orderExample.spec,
  candidates: ['Task_Check', 'Task_Pack', 'Task_Invoice', 'Task_Ship', 'Task_Notify'],
  scenarios: [
    { id: 'valid', description: 'The order is valid.', choices: { Gateway_Valid: ['Flow_Valid_Yes'] } },
    { id: 'invalid', description: 'The order is invalid.', choices: { Gateway_Valid: ['Flow_Valid_No'] } }
  ],
  hints: ['An exclusive gateway activates exactly one outgoing flow.', 'A parallel gateway activates all outgoing flows.'],
  concepts: ['xor-gateway', 'and-gateway']
};

const boundarySpec: DiagramSpec = {
  nodes: [
    { id: 'Start', type: 'startEvent', name: 'Request received', at: [0, 0] },
    { id: 'Approve', type: 'userTask', name: 'Approve request', at: [1, 0] },
    { id: 'Remind', type: 'boundaryEvent', event: 'timer', timer: 'P2D', interrupting: false, name: '2 days', attachedTo: 'Approve', boundaryOffset: 0.75 },
    { id: 'Deadline', type: 'boundaryEvent', event: 'timer', timer: 'P5D', name: '5 days', attachedTo: 'Approve', boundaryOffset: 0.3 },
    { id: 'Grant', type: 'task', name: 'Grant request', at: [2, 0] },
    { id: 'End', type: 'endEvent', name: 'Request granted', at: [3, 0] },
    { id: 'SendRemind', type: 'sendTask', name: 'Send reminder', at: [1.6, 1.5] },
    { id: 'EndR', type: 'endEvent', name: 'Reminder sent', at: [2.6, 1.5] },
    { id: 'Escalate', type: 'userTask', name: 'Decide as head of unit', at: [2.4, 2.6] },
    { id: 'EndE', type: 'endEvent', name: 'Escalated', at: [3.4, 2.6] }
  ],
  flows: [
    { from: 'Start', to: 'Approve' },
    { from: 'Approve', to: 'Grant' },
    { from: 'Grant', to: 'End' },
    { from: 'Remind', to: 'SendRemind' },
    { from: 'SendRemind', to: 'EndR' },
    { from: 'Deadline', to: 'Escalate' },
    { from: 'Escalate', to: 'EndE' }
  ]
};

const predictBoundary: PredictChallenge = {
  id: 'predict-boundary',
  type: 'predict',
  title: 'Reminders and deadlines',
  level: 5,
  minutes: 8,
  summary: 'Predict how interrupting and non-interrupting boundary events change the execution.',
  scenario: 'The approval has a reminder after 2 days (non-interrupting) and a deadline after 5 days (interrupting). Select the executed activities for each situation.',
  spec: boundarySpec,
  candidates: ['Approve', 'Grant', 'SendRemind', 'Escalate'],
  scenarios: [
    { id: 'fast', description: 'The request is approved after one day.' },
    { id: 'slow', description: 'The request is approved after three days.', triggeredBoundaries: ['Remind'] },
    { id: 'never', description: 'Nobody approves the request for a week.', triggeredBoundaries: ['Remind', 'Deadline'] }
  ],
  hints: ['A dashed (non-interrupting) boundary event adds work; the activity continues.', 'A solid (interrupting) boundary event cancels the activity — its normal outgoing flow is not taken.'],
  concepts: ['boundary-events', 'timer-events']
};

const predictInclusive: PredictChallenge = {
  id: 'predict-inclusive',
  type: 'predict',
  title: 'One or both tests?',
  level: 3,
  minutes: 6,
  summary: 'Predict the behavior of inclusive gateways.',
  scenario: 'Patients may need a blood test, an X-ray or both. Select the executed activities.',
  spec: hospitalExample.spec,
  candidates: ['Task_Triage', 'Task_Blood', 'Task_Xray', 'Task_Diagnose'],
  scenarios: [
    { id: 'blood', description: 'Only a blood test is needed.', choices: { Gateway_Tests: ['Flow_Blood'] } },
    { id: 'both', description: 'Both tests are needed.', choices: { Gateway_Tests: ['Flow_Blood', 'Flow_Xray'] } }
  ],
  hints: ['An inclusive gateway activates every path whose condition holds.', 'The inclusive join waits only for the activated paths — “Diagnose patient” runs once.'],
  concepts: ['or-gateway']
};

// ---------------------------------------------------------------------------- deadlock

const deadlockLoan: DeadlockChallenge = {
  id: 'deadlock-credit',
  type: 'deadlock',
  title: 'The hidden deadlock',
  level: 3,
  minutes: 10,
  summary: 'Some loan applications never finish. Find out why.',
  scenario: 'Most applications are processed without problems, but some remain open forever. Use the token simulation (switch the route of the decision) to find the element where execution blocks, select it in the diagram and explain the cause.',
  spec: {
    nodes: [
      { id: 'Start', type: 'startEvent', name: 'Application received', at: [0, 0] },
      { id: 'Register', type: 'task', name: 'Register application', at: [1, 0] },
      { id: 'Split', type: 'parallelGateway', at: [2, 0] },
      { id: 'Credit', type: 'task', name: 'Check credit', at: [3, -0.9] },
      { id: 'CreditOk', type: 'exclusiveGateway', name: 'Credit OK?', at: [4, -0.9] },
      { id: 'Reject', type: 'task', name: 'Reject application', at: [5, -1.9] },
      { id: 'Rejected', type: 'endEvent', name: 'Application rejected', at: [6, -1.9] },
      { id: 'Identity', type: 'task', name: 'Verify identity', at: [3.5, 0.9] },
      { id: 'Join', type: 'parallelGateway', at: [5.5, 0] },
      { id: 'Approve', type: 'task', name: 'Approve loan', at: [6.5, 0] },
      { id: 'End', type: 'endEvent', name: 'Loan approved', at: [7.5, 0] }
    ],
    flows: [
      { from: 'Start', to: 'Register' },
      { from: 'Register', to: 'Split' },
      { from: 'Split', to: 'Credit' },
      { from: 'Split', to: 'Identity' },
      { from: 'Credit', to: 'CreditOk' },
      { id: 'Flow_Ok_Yes', from: 'CreditOk', to: 'Join', name: 'yes' },
      { id: 'Flow_Ok_No', from: 'CreditOk', to: 'Reject', name: 'no' },
      { from: 'Reject', to: 'Rejected' },
      { from: 'Identity', to: 'Join' },
      { from: 'Join', to: 'Approve' },
      { from: 'Approve', to: 'End' }
    ]
  },
  question: 'Why do some applications never finish?',
  options: [
    'When the credit check fails, its branch ends at “Application rejected”, so the parallel join waits forever for a token from the credit branch while the identity branch is stuck there.',
    'The parallel split activates only one of the two branches.',
    'The exclusive gateway waits for both answers before it decides.',
    'End events stop the whole process, so “Verify identity” is never executed.'
  ],
  correctOption: 0,
  hints: ['Select “no” at “Credit OK?” and start the simulation.', 'Look at the parallel join: how many tokens does it need, and how many arrive?'],
  concepts: ['deadlocks', 'synchronization']
};

const deadlockInclusive: DeadlockChallenge = {
  id: 'deadlock-tests',
  type: 'deadlock',
  title: 'Waiting for the X-ray',
  level: 3,
  minutes: 8,
  summary: 'Patients who only need a blood test wait forever.',
  scenario: 'Patients who only need one of the two tests are never diagnosed. Select the element where the execution blocks and explain why.',
  spec: splitJoin('inclusiveGateway', 'parallelGateway', { start: 'Patient arrived', split: 'Which tests?', fa: 'blood test', fb: 'X-ray', a: 'Take blood sample', b: 'Take X-ray', c: 'Diagnose patient', end: 'Patient diagnosed' }),
  question: 'What causes the blocking?',
  options: [
    'The inclusive split may activate only one branch, but the parallel join always waits for both branches.',
    'Inclusive gateways cannot be used for medical processes.',
    'The X-ray takes too long.',
    '“Diagnose patient” has two incoming flows.'
  ],
  correctOption: 0,
  hints: ['Select only one branch at the split gateway and start the simulation.', 'Which join type waits only for the activated branches?'],
  concepts: ['or-gateway', 'deadlocks']
};

// ---------------------------------------------------------------------------- improve

const claimsAsIs = EXAMPLES.find((e) => e.id === 'claims-as-is')!;

const improveClaims: ImproveChallenge = {
  id: 'improve-claims',
  type: 'improve',
  title: 'Faster claims with the same team',
  level: 2,
  minutes: 30,
  summary: 'Redesign a sequential process to meet cycle-time and cost targets without hiring.',
  scenario: `**Claims handling.** Claims arrive about every 10 minutes. Today every claim is registered, checked for coverage, assessed, approved by the manager and paid — strictly one after the other. Average cycle time is close to an hour.

Management wants: **average cycle time ≤ 45 min**, **90% of the claims within 75 min** and **cost per case ≤ € 28** — with the existing **5 employees**.

Facts you may use:
- The coverage check can be **automated** (service task, about 1 minute).
- The coverage check and the damage assessment are **independent** of each other.
- Only about **30% of the claims are high-value** and legally require the manager’s approval.

Keep all five activities (register, check coverage, assess damage, approve, pay). You may change the order, the task types, routing and the resource pools.`,
  start: claimsAsIs.spec,
  sim: { ...claimsAsIs.sim!, replications: 5 },
  roles: [
    { id: 'register', label: 'Register claim', keywords: ['register'] },
    { id: 'coverage', label: 'Check coverage', keywords: ['coverage'] },
    { id: 'assess', label: 'Assess damage', keywords: ['assess'] },
    { id: 'approve', label: 'Approve settlement', keywords: ['approv'] },
    { id: 'pay', label: 'Pay settlement', keywords: ['pay'] }
  ],
  criteria: [
    { kind: 'role', role: 'register' },
    { kind: 'role', role: 'coverage' },
    { kind: 'role', role: 'assess' },
    { kind: 'role', role: 'approve' },
    { kind: 'role', role: 'pay' },
    { kind: 'always', role: 'register' },
    { kind: 'always', role: 'coverage' },
    { kind: 'always', role: 'assess' },
    { kind: 'always', role: 'pay' },
    { kind: 'precedes', before: 'register', after: 'assess' },
    { kind: 'precedes', before: 'coverage', after: 'pay' },
    { kind: 'precedes', before: 'assess', after: 'pay' },
    { kind: 'precedes', before: 'assess', after: 'approve' },
    { kind: 'sound' },
    { kind: 'noErrors' }
  ],
  roleDurations: {
    register: { duration: tri(3, 5, 8) },
    coverage: { duration: tri(4, 6, 10), automated: c(1) },
    assess: { duration: tri(10, 15, 25) },
    approve: { duration: tri(5, 7, 10) },
    pay: { duration: c(1), automated: c(1) }
  },
  defaultDuration: tri(5, 10, 15),
  maxWorkers: 5,
  targets: [
    { metric: 'cycleTime', op: '<=', value: 45, label: 'Average cycle time ≤ 45 min' },
    { metric: 'cycleTimeP90', op: '<=', value: 75, label: '90th percentile cycle time ≤ 75 min' },
    { metric: 'costPerCase', op: '<=', value: 28, label: 'Cost per case ≤ € 28' }
  ],
  hints: [
    'Run the performance simulation first: where do cases wait the longest?',
    'Change the type of “Check coverage” to a service task (wrench icon → Service Task) — automated work needs no clerk.',
    'Run the coverage check in parallel to the assessment (parallel split and join), and route only high-value claims (30%) to the approval with an exclusive gateway.'
  ],
  concepts: ['and-gateway', 'xor-gateway']
};

// ---------------------------------------------------------------------------- compare

const twoSteps = (prefix: string): DiagramSpec => ({
  nodes: [
    { id: 'Start', type: 'startEvent', name: 'Application received', at: [0, 0] },
    { id: 'Check', type: 'userTask', name: 'Check application', at: [1, 0] },
    { id: 'Process', type: 'userTask', name: 'Process application', at: [2, 0] },
    { id: 'End', type: 'endEvent', name: `Application processed`, at: [3, 0] }
  ],
  flows: [
    { id: `${prefix}_1`, from: 'Start', to: 'Check' },
    { id: `${prefix}_2`, from: 'Check', to: 'Process' },
    { id: `${prefix}_3`, from: 'Process', to: 'End' }
  ]
});

const comparePooling: CompareChallenge = {
  id: 'compare-pooling',
  type: 'compare',
  title: 'Specialists or one team?',
  level: 3,
  minutes: 12,
  summary: 'Decide between two staffing alternatives using simulation evidence.',
  scenario: `An office processes applications in two steps. Both alternatives have **four employees** and identical activity durations:

- **Specialized teams:** two employees only check, two employees only process.
- **Pooled team:** all four employees can do both steps.

Run both simulations and decide which alternative has the **shorter average cycle time**. Then explain why.`,
  alternatives: [
    {
      id: 'specialized',
      name: 'Specialized teams',
      description: 'Checkers (2) and processors (2)',
      spec: twoSteps('A'),
      sim: {
        arrival: { kind: 'poisson', interval: 8 },
        numberOfCases: 1500,
        replications: 5,
        pools: [pool('pool-check', 'Checkers', 2, 40), pool('pool-process', 'Processors', 2, 40)],
        activities: { Check: { duration: exp(10), pool: 'pool-check' }, Process: { duration: exp(10), pool: 'pool-process' } }
      }
    },
    {
      id: 'pooled',
      name: 'Pooled team',
      description: 'Four generalists',
      spec: twoSteps('B'),
      sim: {
        arrival: { kind: 'poisson', interval: 8 },
        numberOfCases: 1500,
        replications: 5,
        pools: [pool('pool-team', 'Team', 4, 40)],
        activities: { Check: { duration: exp(10), pool: 'pool-team' }, Process: { duration: exp(10), pool: 'pool-team' } }
      }
    }
  ],
  metric: 'cycleTime',
  better: 'lower',
  question: 'Which alternative has the shorter average cycle time?',
  reasons: [
    { text: 'Pooling: any free employee can take any waiting case, so capacity is not idle while cases wait in another queue.', correctFor: 'pooled' },
    { text: 'Specialists work faster on their own task.', correctFor: null },
    { text: 'The specialized alternative has more employees.', correctFor: null },
    { text: 'Separate queues avoid that checking delays processing.', correctFor: 'specialized' }
  ],
  hints: ['Compare the waiting times, not the processing times — they are the same.', 'Look at the utilization: is it equal in both alternatives?'],
  concepts: ['synchronization']
};

export const CHALLENGES: Challenge[] = [
  buildOrder,
  predictOrder,
  buildOnboarding,
  fixShipping,
  fixSync,
  fixLoop,
  predictInclusive,
  deadlockLoan,
  deadlockInclusive,
  improveClaims,
  comparePooling,
  buildCollab,
  fixCollab,
  buildDeadline,
  predictBoundary
];

export function getChallenge(id: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id);
}
