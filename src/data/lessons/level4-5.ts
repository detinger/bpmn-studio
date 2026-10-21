import type { Concept } from './types';
import type { DiagramSpec } from '../../domain/bpmn/builder';
import { chain } from '../encyclopedia/patterns';

const lanes: DiagramSpec = {
  pools: [
    {
      id: 'P_Company',
      name: 'Online shop',
      rows: [0, 1],
      lanes: [
        { id: 'L_Sales', name: 'Sales', rows: [0, 0] },
        { id: 'L_Warehouse', name: 'Warehouse', rows: [1, 1] }
      ]
    }
  ],
  nodes: [
    { id: 'Start', type: 'startEvent', name: 'Order received', at: [0, 0] },
    { id: 'Check', type: 'userTask', name: 'Check order', at: [1, 0] },
    { id: 'Pack', type: 'manualTask', name: 'Pack goods', at: [2, 1] },
    { id: 'Ship', type: 'manualTask', name: 'Ship goods', at: [3, 1] },
    { id: 'Invoice', type: 'sendTask', name: 'Send invoice', at: [4, 0] },
    { id: 'End', type: 'endEvent', name: 'Order completed', at: [5, 0] }
  ],
  flows: [
    { from: 'Start', to: 'Check' },
    { from: 'Check', to: 'Pack' },
    { from: 'Pack', to: 'Ship' },
    { from: 'Ship', to: 'Invoice' },
    { from: 'Invoice', to: 'End' }
  ]
};

const collaboration: DiagramSpec = {
  pools: [
    { id: 'P_Customer', name: 'Customer', rows: [-1, -1], blackBox: true },
    { id: 'P_Shop', name: 'Online shop', rows: [0, 0] }
  ],
  nodes: [
    { id: 'Start', type: 'startEvent', event: 'message', name: 'Order received', at: [0, 0] },
    { id: 'Check', type: 'task', name: 'Check order', at: [1, 0] },
    { id: 'Confirm', type: 'sendTask', name: 'Send confirmation', at: [2, 0] },
    { id: 'Wait', type: 'intermediateCatchEvent', event: 'message', name: 'Payment received', at: [3, 0] },
    { id: 'Ship', type: 'task', name: 'Ship goods', at: [4, 0] },
    { id: 'End', type: 'endEvent', name: 'Order completed', at: [5, 0] }
  ],
  flows: [
    { from: 'Start', to: 'Check' },
    { from: 'Check', to: 'Confirm' },
    { from: 'Confirm', to: 'Wait' },
    { from: 'Wait', to: 'Ship' },
    { from: 'Ship', to: 'End' }
  ],
  messageFlows: [
    { from: 'P_Customer', to: 'Start', name: 'order' },
    { from: 'Confirm', to: 'P_Customer', name: 'confirmation' },
    { from: 'P_Customer', to: 'Wait', name: 'payment' }
  ]
};

const twoProcesses: DiagramSpec = {
  pools: [
    { id: 'P_Customer', name: 'Customer', rows: [-1, -1], processId: 'Process_Customer' },
    { id: 'P_Shop', name: 'Online shop', rows: [0.4, 0.4], processId: 'Process_Shop' }
  ],
  nodes: [
    { id: 'C_Start', type: 'startEvent', name: 'Product needed', at: [0, -1] },
    { id: 'C_Order', type: 'sendTask', name: 'Place order', at: [1, -1] },
    { id: 'C_Wait', type: 'intermediateCatchEvent', event: 'message', name: 'Goods received', at: [3, -1] },
    { id: 'C_End', type: 'endEvent', name: 'Need satisfied', at: [4, -1] },
    { id: 'S_Start', type: 'startEvent', event: 'message', name: 'Order received', at: [1, 0.4] },
    { id: 'S_Ship', type: 'sendTask', name: 'Ship goods', at: [3, 0.4] },
    { id: 'S_End', type: 'endEvent', name: 'Order fulfilled', at: [4, 0.4] }
  ],
  flows: [
    { from: 'C_Start', to: 'C_Order' },
    { from: 'C_Order', to: 'C_Wait' },
    { from: 'C_Wait', to: 'C_End' },
    { from: 'S_Start', to: 'S_Ship' },
    { from: 'S_Ship', to: 'S_End' }
  ],
  messageFlows: [
    { from: 'C_Order', to: 'S_Start', name: 'order' },
    { from: 'S_Ship', to: 'C_Wait', name: 'goods' }
  ]
};

const subprocess: DiagramSpec = {
  nodes: [
    { id: 'Start', type: 'startEvent', name: 'Trip approved', at: [0, 0] },
    { id: 'Sub', type: 'subProcess', name: 'Book trip', at: [2, 0] },
    { id: 'S1', type: 'startEvent', at: [1, 0], parent: 'Sub' },
    { id: 'Split', type: 'parallelGateway', at: [1.8, 0], parent: 'Sub' },
    { id: 'Flight', type: 'task', name: 'Book flight', at: [2.8, -0.75], parent: 'Sub' },
    { id: 'Hotel', type: 'task', name: 'Book hotel', at: [2.8, 0.75], parent: 'Sub' },
    { id: 'Join', type: 'parallelGateway', at: [3.8, 0], parent: 'Sub' },
    { id: 'S2', type: 'endEvent', at: [4.6, 0], parent: 'Sub' },
    { id: 'Inform', type: 'sendTask', name: 'Send itinerary', at: [6, 0] },
    { id: 'End', type: 'endEvent', name: 'Trip booked', at: [7, 0] }
  ],
  flows: [
    { from: 'Start', to: 'Sub', waypoints: [[178, 110], [256, 110]] },
    { from: 'S1', to: 'Split' },
    { from: 'Split', to: 'Flight' },
    { from: 'Split', to: 'Hotel' },
    { from: 'Flight', to: 'Join' },
    { from: 'Hotel', to: 'Join' },
    { from: 'Join', to: 'S2' },
    { from: 'Sub', to: 'Inform', waypoints: [[904, 110], [1010, 110]] },
    { from: 'Inform', to: 'End' }
  ]
};

const boundaryTimer: DiagramSpec = {
  nodes: [
    { id: 'Start', type: 'startEvent', name: 'Request received', at: [0, 0] },
    { id: 'Approve', type: 'userTask', name: 'Approve request', at: [1, 0] },
    { id: 'Remind', type: 'boundaryEvent', event: 'timer', timer: 'P2D', interrupting: false, name: '2 days', attachedTo: 'Approve', boundaryOffset: 0.75 },
    { id: 'Deadline', type: 'boundaryEvent', event: 'timer', timer: 'P5D', name: '5 days', attachedTo: 'Approve', boundaryOffset: 0.3 },
    { id: 'Book', type: 'task', name: 'Grant request', at: [2, 0] },
    { id: 'End', type: 'endEvent', name: 'Request granted', at: [3, 0] },
    { id: 'SendRemind', type: 'sendTask', name: 'Send reminder', at: [1.6, 1.5] },
    { id: 'EndR', type: 'endEvent', name: 'Reminder sent', at: [2.6, 1.5] },
    { id: 'Escalate', type: 'userTask', name: 'Decide as head of unit', at: [2.4, 2.6] },
    { id: 'EndE', type: 'endEvent', name: 'Escalated', at: [3.4, 2.6] }
  ],
  flows: [
    { from: 'Start', to: 'Approve' },
    { from: 'Approve', to: 'Book' },
    { from: 'Book', to: 'End' },
    { from: 'Remind', to: 'SendRemind' },
    { from: 'SendRemind', to: 'EndR' },
    { from: 'Deadline', to: 'Escalate' },
    { from: 'Escalate', to: 'EndE' }
  ]
};

const errorHandling: DiagramSpec = {
  nodes: [
    { id: 'Start', type: 'startEvent', name: 'Order placed', at: [0, 0] },
    { id: 'Sub', type: 'subProcess', name: 'Process payment', at: [2, 0] },
    { id: 'S1', type: 'startEvent', at: [1, 0], parent: 'Sub' },
    { id: 'Charge', type: 'serviceTask', name: 'Charge card', at: [2, 0], parent: 'Sub' },
    { id: 'Ok', type: 'exclusiveGateway', name: 'Charged?', at: [3, 0], parent: 'Sub' },
    { id: 'S2', type: 'endEvent', name: 'Paid', at: [4, 0], parent: 'Sub' },
    { id: 'SErr', type: 'endEvent', event: 'error', name: 'Payment failed', at: [4, 1], parent: 'Sub' },
    { id: 'Catch', type: 'boundaryEvent', event: 'error', name: 'Payment failed', attachedTo: 'Sub', boundaryOffset: 0.85 },
    { id: 'Ship', type: 'task', name: 'Ship order', at: [5.5, 0] },
    { id: 'End', type: 'endEvent', name: 'Order shipped', at: [6.5, 0] },
    { id: 'Cancel', type: 'sendTask', name: 'Notify customer', at: [5.5, 2.4] },
    { id: 'End2', type: 'endEvent', name: 'Order cancelled', at: [6.5, 2.4] }
  ],
  flows: [
    { from: 'Start', to: 'Sub', waypoints: [[178, 110], [256, 110]] },
    { from: 'S1', to: 'Charge' },
    { from: 'Charge', to: 'Ok' },
    { id: 'Flow_Ok_Yes', from: 'Ok', to: 'S2', name: 'yes' },
    { id: 'Flow_Ok_No', from: 'Ok', to: 'SErr', name: 'no' },
    { from: 'Sub', to: 'Ship', waypoints: [[814, 110], [935, 110]] },
    { from: 'Ship', to: 'End' },
    { from: 'Catch', to: 'Cancel' },
    { from: 'Cancel', to: 'End2' }
  ]
};

const escalation: DiagramSpec = {
  nodes: [
    { id: 'Start', type: 'startEvent', name: 'Quote requested', at: [0, 0] },
    { id: 'Sub', type: 'subProcess', name: 'Prepare quote', at: [2, 0] },
    { id: 'S1', type: 'startEvent', at: [1, 0], parent: 'Sub' },
    { id: 'Calc', type: 'task', name: 'Calculate price', at: [2, 0], parent: 'Sub' },
    { id: 'Big', type: 'exclusiveGateway', name: 'Discount > 20%?', at: [3, 0], parent: 'Sub' },
    { id: 'Esc', type: 'intermediateThrowEvent', event: 'escalation', name: 'Approval needed', at: [3, 1], parent: 'Sub' },
    { id: 'Merge', type: 'exclusiveGateway', at: [4, 0], parent: 'Sub' },
    { id: 'Write', type: 'task', name: 'Write quote', at: [5, 0], parent: 'Sub' },
    { id: 'S2', type: 'endEvent', at: [6, 0], parent: 'Sub' },
    { id: 'Catch', type: 'boundaryEvent', event: 'escalation', interrupting: false, name: 'Approval needed', attachedTo: 'Sub', boundaryOffset: 0.6 },
    { id: 'Inform', type: 'userTask', name: 'Review discount', at: [5, 2.5] },
    { id: 'EndI', type: 'endEvent', name: 'Discount reviewed', at: [6, 2.5] },
    { id: 'Send', type: 'sendTask', name: 'Send quote', at: [7.5, 0] },
    { id: 'End', type: 'endEvent', name: 'Quote sent', at: [8.5, 0] }
  ],
  flows: [
    { from: 'Start', to: 'Sub', waypoints: [[178, 110], [256, 110]] },
    { from: 'S1', to: 'Calc' },
    { from: 'Calc', to: 'Big' },
    { from: 'Big', to: 'Esc', name: 'yes' },
    { from: 'Big', to: 'Merge', name: 'no' },
    { from: 'Esc', to: 'Merge' },
    { from: 'Merge', to: 'Write' },
    { from: 'Write', to: 'S2' },
    { from: 'Sub', to: 'Send', waypoints: [[1114, 110], [1235, 110]] },
    { from: 'Send', to: 'End' },
    { from: 'Catch', to: 'Inform' },
    { from: 'Inform', to: 'EndI' }
  ]
};

const compensation: DiagramSpec = {
  nodes: [
    { id: 'Start', type: 'startEvent', name: 'Trip requested', at: [0, 0] },
    { id: 'Book', type: 'task', name: 'Book hotel', at: [1, 0] },
    { id: 'Comp', type: 'boundaryEvent', event: 'compensate', attachedTo: 'Book' },
    { id: 'Cancel', type: 'task', name: 'Cancel hotel', at: [2, 1.2], isForCompensation: true },
    { id: 'Pay', type: 'task', name: 'Charge customer', at: [2, 0] },
    { id: 'Ok', type: 'exclusiveGateway', name: 'Payment OK?', at: [3, 0] },
    { id: 'End', type: 'endEvent', name: 'Trip booked', at: [4, -0.8] },
    { id: 'Undo', type: 'intermediateThrowEvent', event: 'compensate', name: 'Undo booking', at: [4, 0.8] },
    { id: 'End2', type: 'endEvent', name: 'Trip cancelled', at: [5, 0.8] }
  ],
  flows: [
    { from: 'Start', to: 'Book' },
    { from: 'Book', to: 'Pay' },
    { from: 'Pay', to: 'Ok' },
    { from: 'Ok', to: 'End', name: 'yes' },
    { from: 'Ok', to: 'Undo', name: 'no' },
    { from: 'Undo', to: 'End2' }
  ],
  associations: [{ from: 'Comp', to: 'Cancel' }]
};

export const LEVEL4: Concept[] = [
  {
    id: 'pools-lanes',
    title: 'Pools and lanes',
    level: 4,
    summary: 'Pools are participants; lanes are roles inside a participant.',
    explanation: `A **pool** represents a **participant** — an organization or an independent party such as a customer. Each pool has its own process; pools are coordinated only through messages.

**Lanes** subdivide a pool into **roles, departments or systems**: Sales, Warehouse, Accounting. They show *who* is responsible, but have **no execution semantics**: tokens cross lane borders like any other flow.

Rule of thumb: if two parties are under the same control (same company, same process), use lanes. If they are independent — the customer decides on their own when to pay — use separate pools.`,
    example: { spec: lanes, caption: 'One participant (the shop), two lanes (Sales and Warehouse).' },
    demo: { spec: lanes, hint: 'Start the process and watch the token cross the lane border: lanes only show responsibility.' },
    mistake: {
      spec: {
        pools: [
          {
            id: 'P_Company',
            name: 'Online shop',
            rows: [0, 1],
            lanes: [
              { id: 'L_Customer', name: 'Customer', rows: [0, 0] },
              { id: 'L_Sales', name: 'Sales', rows: [1, 1] }
            ]
          }
        ],
        nodes: [
          { id: 'Start', type: 'startEvent', name: 'Product needed', at: [0, 0] },
          { id: 'Order', type: 'task', name: 'Place order', at: [1, 0] },
          { id: 'Check', type: 'task', name: 'Check order', at: [2, 1] },
          { id: 'Pay', type: 'task', name: 'Pay invoice', at: [3, 0] },
          { id: 'End', type: 'endEvent', name: 'Order paid', at: [4, 0] }
        ],
        flows: [
          { from: 'Start', to: 'Order' },
          { from: 'Order', to: 'Check' },
          { from: 'Check', to: 'Pay' },
          { from: 'Pay', to: 'End' }
        ]
      },
      title: 'The customer as a lane',
      text: 'Here the shop’s process “controls” when the customer pays — a sequence flow makes “Pay invoice” follow automatically. In reality the customer is independent. Model the customer as a separate pool and exchange messages.'
    },
    exercise: {
      kind: 'mcq',
      id: 'ex-pool-lane',
      prompt: 'A hospital process involves the admission desk, the radiology department and the patient’s health insurer. How should they be modeled?',
      options: ['Three pools', 'Three lanes in one pool', 'One pool “Hospital” with lanes “Admission” and “Radiology”, and a separate pool “Insurer”', 'One lane per person'],
      correct: [2],
      explanation: 'Admission and radiology belong to the same organization (lanes); the insurer is an independent participant (pool).'
    },
    quiz: [
      { id: 'q1', question: 'Do lanes affect how tokens move?', options: ['Yes, tokens must wait at lane borders', 'No, lanes only show responsibility', 'Only for message flows', 'Only in sub-processes'], correct: [1], explanation: 'Lanes are organizational; they have no execution semantics.' },
      { id: 'q2', question: 'What connects two pools?', options: ['Sequence flows', 'Message flows', 'Associations', 'Lanes'], correct: [1], explanation: 'Sequence flows never cross pool borders.' }
    ],
    encyclopedia: ['pool', 'lane']
  },
  {
    id: 'message-flows',
    title: 'Message flows',
    level: 4,
    summary: 'Message flows show the communication between participants.',
    explanation: `A **message flow** (dashed line, circle at the start, open arrow at the end) shows a **message** sent from one pool to another: an order, an invoice, a confirmation.

Message flows start at elements that can **send** (send task, task, message throw/end event, or the pool border of a black-box pool) and end at elements that can **receive** (receive task, task, message start/catch/boundary event, or a pool border).

A received message often **triggers** something: a message start event creates a process instance; a message catch event lets a waiting token continue. Message flows never connect elements of the same pool.`,
    example: { spec: collaboration, caption: 'The shop’s process exchanges three messages with the customer (black-box pool).' },
    demo: { spec: collaboration, hint: 'Start the shop process. The token waits at “Payment received” until the customer’s payment message arrives — trigger it on the canvas.' },
    mistake: {
      spec: {
        pools: [{ id: 'P', name: 'Online shop', rows: [0, 1], lanes: [{ id: 'L1', name: 'Sales', rows: [0, 0] }, { id: 'L2', name: 'Warehouse', rows: [1, 1] }] }],
        nodes: [
          { id: 'Start', type: 'startEvent', name: 'Order received', at: [0, 0] },
          { id: 'A', type: 'sendTask', name: 'Send picking list', at: [1, 0] },
          { id: 'EndA', type: 'endEvent', name: 'List sent', at: [2, 0] },
          { id: 'B', type: 'receiveTask', name: 'Receive picking list', at: [1, 1] },
          { id: 'C', type: 'task', name: 'Pick goods', at: [2, 1] },
          { id: 'End', type: 'endEvent', name: 'Goods picked', at: [3, 1] }
        ],
        flows: [
          { from: 'Start', to: 'A' },
          { from: 'A', to: 'EndA' },
          { from: 'B', to: 'C' },
          { from: 'C', to: 'End' }
        ],
        messageFlows: [{ from: 'A', to: 'B', name: 'picking list' }]
      },
      title: 'Messages between lanes',
      text: 'Sales and Warehouse belong to the same pool. Work is handed over with a sequence flow, not a message flow. The validator reports “message flow inside one pool”.'
    },
    exercise: {
      kind: 'mcq',
      id: 'ex-msg-endpoint',
      prompt: 'Which elements can be the target of a message flow?',
      options: ['Message start event', 'Exclusive gateway', 'Receive task', 'Black-box pool', 'End event without trigger'],
      correct: [0, 2, 3],
      explanation: 'Gateways never receive messages, and a plain end event cannot receive anything.'
    },
    quiz: [
      { id: 'q1', question: 'How is a message flow drawn?', options: ['Solid line, filled arrow', 'Dashed line, open circle at the start, open arrow at the end', 'Dotted line without arrow', 'Double line'], correct: [1], explanation: 'Solid = sequence flow; dotted = association.' },
      { id: 'q2', question: 'Can a message flow connect two tasks of the same pool?', options: ['Yes', 'No'], correct: [1], explanation: 'Inside a pool, use sequence flows.' }
    ],
    encyclopedia: ['message-flow', 'message-event', 'send-task', 'receive-task']
  },
  {
    id: 'interorganizational',
    title: 'Interorganizational processes',
    level: 4,
    summary: 'Several participants, each with its own process, coordinated by messages.',
    explanation: `In an **interorganizational** (collaboration) model, two or more participants each run their own process. Neither controls the other: they **coordinate** by sending and waiting for messages.

Good collaboration models:

- give each participant a **pool** with its own start and end events;
- pair every **send** with a **receive** on the other side (send task ↔ message start/catch event);
- use **black-box pools** for partners whose internal process is unknown or irrelevant.

Checking a collaboration means checking both processes *and* the message exchange: does each party wait for a message that the other actually sends? A party that waits for a message that is never sent is blocked — a deadlock across organizations.`,
    example: { spec: twoProcesses, caption: 'Customer and shop each have their own process; two messages coordinate them.' },
    demo: { spec: twoProcesses, hint: 'Start the customer’s process: its order message starts the shop process; the shop’s shipment lets the customer continue.' },
    mistake: {
      spec: {
        pools: [
          { id: 'P_Customer', name: 'Customer', rows: [-1, -1], processId: 'Process_Customer' },
          { id: 'P_Shop', name: 'Online shop', rows: [0.4, 0.4], processId: 'Process_Shop' }
        ],
        nodes: [
          { id: 'C_Start', type: 'startEvent', name: 'Product needed', at: [0, -1] },
          { id: 'C_Order', type: 'sendTask', name: 'Place order', at: [1, -1] },
          { id: 'C_Wait', type: 'intermediateCatchEvent', event: 'message', name: 'Goods received', at: [3, -1] },
          { id: 'C_End', type: 'endEvent', name: 'Need satisfied', at: [4, -1] },
          { id: 'S_Start', type: 'startEvent', event: 'message', name: 'Order received', at: [1, 0.4] },
          { id: 'S_Ship', type: 'task', name: 'Ship goods', at: [3, 0.4] },
          { id: 'S_End', type: 'endEvent', name: 'Order fulfilled', at: [4, 0.4] }
        ],
        flows: [
          { from: 'C_Start', to: 'C_Order' },
          { from: 'C_Order', to: 'C_Wait' },
          { from: 'C_Wait', to: 'C_End' },
          { from: 'S_Start', to: 'S_Ship' },
          { from: 'S_Ship', to: 'S_End' }
        ],
        messageFlows: [{ from: 'C_Order', to: 'S_Start', name: 'order' }]
      },
      title: 'Waiting for a message nobody sends',
      text: 'The customer waits for “Goods received”, but no message flow leads there: the shop never sends a shipment notification. The customer’s process can never complete.'
    },
    exercise: {
      kind: 'click',
      id: 'ex-click-collab',
      prompt: 'Click the element in which the customer would wait forever.',
      spec: {
        pools: [
          { id: 'P_Customer', name: 'Customer', rows: [-1, -1], processId: 'Process_Customer' },
          { id: 'P_Shop', name: 'Online shop', rows: [0.4, 0.4], processId: 'Process_Shop' }
        ],
        nodes: [
          { id: 'C_Start', type: 'startEvent', name: 'Product needed', at: [0, -1] },
          { id: 'C_Order', type: 'sendTask', name: 'Place order', at: [1, -1] },
          { id: 'C_Wait', type: 'intermediateCatchEvent', event: 'message', name: 'Goods received', at: [3, -1] },
          { id: 'C_End', type: 'endEvent', name: 'Need satisfied', at: [4, -1] },
          { id: 'S_Start', type: 'startEvent', event: 'message', name: 'Order received', at: [1, 0.4] },
          { id: 'S_Ship', type: 'task', name: 'Ship goods', at: [3, 0.4] },
          { id: 'S_End', type: 'endEvent', name: 'Order fulfilled', at: [4, 0.4] }
        ],
        flows: [
          { from: 'C_Start', to: 'C_Order' },
          { from: 'C_Order', to: 'C_Wait' },
          { from: 'C_Wait', to: 'C_End' },
          { from: 'S_Start', to: 'S_Ship' },
          { from: 'S_Ship', to: 'S_End' }
        ],
        messageFlows: [{ from: 'C_Order', to: 'S_Start', name: 'order' }]
      },
      correctIds: ['C_Wait'],
      explanation: 'No message flow leads to “Goods received”. Let “Ship goods” send a message (send task + message flow) to the customer.'
    },
    quiz: [
      { id: 'q1', question: 'What is a black-box pool?', options: ['A pool with a hidden, unknown internal process', 'A pool without lanes', 'An empty diagram', 'A pool of resources for simulation'], correct: [0], explanation: 'Black-box pools show a partner whose process is not modeled.' },
      { id: 'q2', question: 'Which statement about collaboration is true?', options: ['One pool controls the other via sequence flows', 'Each participant runs its own process; they coordinate via messages', 'Lanes are used for external partners', 'Message flows carry tokens of the sender'], correct: [1], explanation: 'Independent participants, coordinated by messages.' }
    ],
    encyclopedia: ['pool', 'message-flow', 'message-event']
  }
];

export const LEVEL5: Concept[] = [
  {
    id: 'subprocesses',
    title: 'Sub-processes',
    level: 5,
    summary: 'Sub-processes group work into a scope with its own start and end.',
    explanation: `A **sub-process** is an activity that contains a process. It helps to **structure** large models (collapse details behind a “+” marker) and to define a **scope**: everything inside can be cancelled together, and boundary events attached to the sub-process cover all of its content.

Execution: when the token reaches the sub-process, its inner **blank start event** gets a token. The sub-process completes when no token is left inside — then the outer token continues.

**Embedded sub-processes** belong to their parent model; **call activities** invoke a separately defined, reusable process.`,
    example: { spec: subprocess, caption: 'Flight and hotel are booked in parallel inside the sub-process “Book trip”.' },
    demo: { spec: subprocess, hint: 'Start the process. The sub-process completes only after both bookings; then “Send itinerary” runs.' },
    mistake: {
      spec: {
        nodes: [
          { id: 'Start', type: 'startEvent', name: 'Trip approved', at: [0, 0] },
          { id: 'Sub', type: 'subProcess', name: 'Book trip', at: [2, 0] },
          { id: 'S1', type: 'startEvent', event: 'message', name: 'Booking requested', at: [1, 0], parent: 'Sub' },
          { id: 'Flight', type: 'task', name: 'Book flight', at: [2, 0], parent: 'Sub' },
          { id: 'S2', type: 'endEvent', at: [3, 0], parent: 'Sub' },
          { id: 'End', type: 'endEvent', name: 'Trip booked', at: [4.5, 0] }
        ],
        flows: [
          { from: 'Start', to: 'Sub', waypoints: [[178, 110], [256, 110]] },
          { from: 'S1', to: 'Flight' },
          { from: 'Flight', to: 'S2' },
          { from: 'Sub', to: 'End', waypoints: [[664, 110], [817, 110]] }
        ]
      },
      title: 'A typed start event inside an embedded sub-process',
      text: 'An embedded sub-process is started by the arriving token, so its start event must be blank. A message start event here is invalid BPMN (bpmnlint: sub-process-blank-start-event).'
    },
    exercise: {
      kind: 'mcq',
      id: 'ex-subprocess',
      prompt: 'When does an embedded sub-process complete?',
      options: ['When its first end event is reached', 'When no tokens are left inside it', 'After a fixed time', 'When the parent process ends'],
      correct: [1],
      explanation: 'Like a process instance: it completes when all inner tokens are consumed.'
    },
    quiz: [
      { id: 'q1', question: 'Which start event is allowed inside an embedded sub-process?', options: ['Message start event', 'Timer start event', 'Blank (none) start event', 'Signal start event'], correct: [2], explanation: 'The sub-process is triggered by its incoming sequence flow.' },
      { id: 'q2', question: 'What is the difference between a sub-process and a call activity?', options: ['None', 'A call activity invokes a separately defined, reusable process', 'A sub-process cannot contain gateways', 'A call activity has no boundary events'], correct: [1], explanation: 'Call activities reference global processes.' }
    ],
    encyclopedia: ['subprocess', 'call-activity']
  },
  {
    id: 'boundary-events',
    title: 'Boundary events',
    level: 5,
    summary: 'Events attached to an activity react to something that happens while it runs.',
    explanation: `A **boundary event** sits on the border of an activity and is active **only while the activity runs**.

- **Interrupting** (solid double border): the activity is **cancelled**, and the token continues along the boundary event’s outgoing flow (the *exception flow*).
- **Non-interrupting** (dashed double border): the activity **continues**; an **additional** token starts the exception flow.

Typical triggers: timers (deadlines, reminders), messages (cancellation by the customer), errors and escalations (from sub-processes).

In the performance simulator, an interrupting timer is a real deadline: if the activity (including waiting for a worker) takes longer than the timer, it is cancelled.`,
    example: { spec: boundaryTimer, caption: 'A reminder after 2 days (non-interrupting) and a deadline after 5 days (interrupting).' },
    demo: { spec: boundaryTimer, hint: 'Start the process. While “Approve request” waits (step mode), trigger the 2-day timer: the task continues. Then trigger the 5-day timer: the task is cancelled.' },
    mistake: {
      spec: {
        nodes: [
          { id: 'Start', type: 'startEvent', name: 'Request received', at: [0, 0] },
          { id: 'Approve', type: 'userTask', name: 'Approve request', at: [1, 0] },
          { id: 'Deadline', type: 'boundaryEvent', event: 'timer', timer: 'P5D', name: '5 days', attachedTo: 'Approve' },
          { id: 'Grant', type: 'task', name: 'Grant request', at: [2, 0] },
          { id: 'End', type: 'endEvent', name: 'Request granted', at: [3, 0] }
        ],
        flows: [
          { from: 'Start', to: 'Approve' },
          { from: 'Approve', to: 'Grant' },
          { from: 'Grant', to: 'End' }
        ]
      },
      title: 'A deadline without consequence',
      text: 'The interrupting timer cancels the approval after 5 days — and then the token has nowhere to go. The request silently disappears. Every boundary event needs an outgoing flow.'
    },
    exercise: {
      kind: 'predict',
      id: 'ex-predict-boundary',
      prompt: 'The 5-day deadline expires before the approval is done. Which activities are executed?',
      spec: boundaryTimer,
      triggeredBoundaries: ['Deadline'],
      candidates: ['Approve', 'Book', 'SendRemind', 'Escalate'],
      explanation: '“Approve request” starts but is interrupted; the token continues to “Decide as head of unit”. “Grant request” is not executed. (The reminder is only sent if the 2-day timer fires as well.)'
    },
    quiz: [
      { id: 'q1', question: 'How is a non-interrupting boundary event drawn?', options: ['With a solid double border', 'With a dashed double border', 'With a thick border', 'Filled black'], correct: [1], explanation: 'Dashed = non-interrupting.' },
      { id: 'q2', question: 'An interrupting message boundary event occurs. What happens to the activity?', options: ['It continues', 'It is cancelled and the exception flow starts', 'It restarts', 'Nothing'], correct: [1], explanation: 'Interrupting events cancel their activity.' }
    ],
    encyclopedia: ['boundary-event', 'timer-event']
  },
  {
    id: 'error-handling',
    title: 'Error handling',
    level: 5,
    summary: 'Errors abort a scope and are caught by error boundary events.',
    explanation: `Business exceptions that make it impossible to continue — the payment fails, the product is no longer available — can be modeled with **error events**.

An **error end event** inside a sub-process ends that sub-process and **throws** the error. An **error boundary event** on the sub-process **catches** it: the sub-process is interrupted and the token continues along the exception flow.

Errors are always **interrupting**. Each error end event should have a matching catch — otherwise the error propagates to the enclosing process. For outcomes that are not exceptional (“offer rejected”), use normal gateways and end events instead.`,
    example: { spec: errorHandling, caption: 'A failed payment ends the sub-process with an error; the boundary event handles it.' },
    demo: { spec: errorHandling, hint: 'Select “no” at “Charged?” (click the gateway), then start: the error leaves the sub-process through the boundary event.' },
    mistake: {
      spec: {
        nodes: [
          { id: 'Start', type: 'startEvent', name: 'Order placed', at: [0, 0] },
          { id: 'Sub', type: 'subProcess', name: 'Process payment', at: [2, 0] },
          { id: 'S1', type: 'startEvent', at: [1, 0], parent: 'Sub' },
          { id: 'Charge', type: 'serviceTask', name: 'Charge card', at: [2, 0], parent: 'Sub' },
          { id: 'Ok', type: 'exclusiveGateway', name: 'Charged?', at: [3, 0], parent: 'Sub' },
          { id: 'S2', type: 'endEvent', name: 'Paid', at: [4, 0], parent: 'Sub' },
          { id: 'SErr', type: 'endEvent', event: 'error', name: 'Payment failed', at: [4, 1], parent: 'Sub' },
          { id: 'Ship', type: 'task', name: 'Ship order', at: [5.5, 0] },
          { id: 'End', type: 'endEvent', name: 'Order shipped', at: [6.5, 0] }
        ],
        flows: [
          { from: 'Start', to: 'Sub', waypoints: [[178, 110], [256, 110]] },
          { from: 'S1', to: 'Charge' },
          { from: 'Charge', to: 'Ok' },
          { from: 'Ok', to: 'S2', name: 'yes' },
          { from: 'Ok', to: 'SErr', name: 'no' },
          { from: 'Sub', to: 'Ship', waypoints: [[814, 110], [935, 110]] },
          { from: 'Ship', to: 'End' }
        ]
      },
      title: 'An error nobody catches',
      text: 'The sub-process throws “Payment failed”, but there is no error boundary event to catch it. Depending on the engine the whole process fails — and the customer is never informed. Add an error boundary event with an exception path.'
    },
    exercise: {
      kind: 'predict',
      id: 'ex-predict-error',
      prompt: 'The card cannot be charged. Which activities are executed?',
      spec: errorHandling,
      choices: { Ok: ['Flow_Ok_No'] },
      candidates: ['Charge', 'Ship', 'Cancel'],
      explanation: '“Charge card” runs, the error end event interrupts the sub-process, and the boundary event leads to “Notify customer”. “Ship order” is skipped.'
    },
    quiz: [
      { id: 'q1', question: 'Can an error boundary event be non-interrupting?', options: ['Yes', 'No'], correct: [1], explanation: 'Errors always interrupt; use escalations for non-interrupting signals to a parent.' },
      { id: 'q2', question: 'Which event catches an error thrown inside a sub-process?', options: ['An error boundary event on the sub-process', 'A message start event', 'A timer event', 'An end event'], correct: [0], explanation: 'Or an error start event of an event sub-process.' }
    ],
    encyclopedia: ['error-event', 'boundary-event', 'subprocess']
  },
  {
    id: 'timer-events',
    title: 'Timer events',
    level: 5,
    summary: 'Timers model schedules, waiting periods and deadlines.',
    explanation: `**Timer events** (clock symbol) appear in three roles:

- **Timer start event** — start instances on a schedule (“every Monday 8:00”).
- **Intermediate timer event** — wait for a duration or until a date (“wait 14 days”).
- **Timer boundary event** — a **deadline** (interrupting) or a **reminder** (non-interrupting) on a running activity.

Timers are written as ISO 8601 expressions: \`PT2H\` (2 hours), \`P14D\` (14 days), \`R/P1W\` (every week). The performance simulator reads timer durations from the model and lets you override them with probability distributions.`,
    example: {
      spec: chain([
        { id: 'Start', type: 'startEvent', name: 'Invoice overdue' },
        { id: 'Remind', type: 'sendTask', name: 'Send reminder' },
        { id: 'Wait', type: 'intermediateCatchEvent', event: 'timer', timer: 'P14D', name: '14 days' },
        { id: 'Collect', type: 'task', name: 'Hand over to collection' },
        { id: 'End', type: 'endEvent', name: 'Collection started' }
      ]),
      caption: 'A waiting period of 14 days between two activities.'
    },
    demo: { spec: boundaryTimer, hint: 'Use the timers on “Approve request”: trigger them while the task is active and compare interrupting and non-interrupting behavior.' },
    mistake: {
      spec: chain([
        { id: 'Start', type: 'startEvent', name: 'Order received' },
        { id: 'Wait', type: 'intermediateCatchEvent', event: 'timer', timer: 'PT30M', name: 'Pack goods (30 min)' },
        { id: 'End', type: 'endEvent', name: 'Goods packed' }
      ]),
      title: 'A timer instead of an activity',
      text: 'Work that takes 30 minutes is still work: model it as an activity (“Pack goods”) and give it a duration in the simulation. Timers model waiting, not working.'
    },
    exercise: {
      kind: 'mcq',
      id: 'ex-timer',
      prompt: 'Which ISO 8601 expression means “2 hours”?',
      options: ['P2H', 'PT2H', 'T2H', '2H'],
      correct: [1],
      explanation: 'Time parts (hours, minutes, seconds) follow the “T”: PT2H. P2D would be 2 days.'
    },
    quiz: [
      { id: 'q1', question: 'Which timer would you use to send a reminder after 3 days without cancelling the approval?', options: ['Interrupting timer boundary event', 'Non-interrupting timer boundary event', 'Timer start event', 'Timer end event'], correct: [1], explanation: 'Non-interrupting: the approval continues, the reminder is sent in parallel.' },
      { id: 'q2', question: 'What does “P14D” mean?', options: ['14 hours', '14 days', '14 weeks', 'Every 14 days'], correct: [1], explanation: 'P = period, D = days.' }
    ],
    encyclopedia: ['timer-event', 'boundary-event']
  },
  {
    id: 'escalations',
    title: 'Escalations',
    level: 5,
    summary: 'Escalations hand a situation to a higher responsibility, optionally without stopping work.',
    explanation: `An **escalation** (upward arrow) informs a higher level — the parent process, a manager — that something needs attention. Unlike an error, it can be caught **non-interrupting**: the sub-process continues while someone else reacts.

A typical pattern: an **escalation intermediate throw event** inside a sub-process (“Approval needed”) and a **non-interrupting escalation boundary event** on the sub-process that starts a parallel review.`,
    example: { spec: escalation, caption: 'Large discounts raise an escalation; the review runs in parallel while the quote is written.' },
    demo: { spec: escalation, hint: 'Select “yes” at “Discount > 20%?”, then start: the escalation creates an additional token outside the sub-process, while the quote is still written.' },
    mistake: {
      spec: chain([
        { id: 'Start', type: 'startEvent', name: 'Ticket received' },
        { id: 'A', type: 'task', name: 'Analyse ticket' },
        { id: 'E', type: 'endEvent', event: 'error', name: 'Complex case' }
      ]),
      title: 'Error instead of escalation',
      text: 'A complex case is not a failure — the work should continue with help. An error end event ends the scope; an escalation (possibly non-interrupting) brings in the team lead without aborting.'
    },
    exercise: {
      kind: 'mcq',
      id: 'ex-escalation',
      prompt: 'What distinguishes escalation from error events?',
      options: ['Escalations can be caught non-interrupting', 'Escalations cannot leave sub-processes', 'Errors can be non-interrupting', 'There is no difference'],
      correct: [0],
      explanation: 'Errors always interrupt; escalations can interrupt or not.'
    },
    quiz: [
      { id: 'q1', question: 'Which symbol represents an escalation?', options: ['Lightning', 'Upward arrow (chevron)', 'Triangle', 'Envelope'], correct: [1], explanation: 'Lightning = error, triangle = signal, envelope = message.' },
      { id: 'q2', question: 'A non-interrupting escalation boundary event is triggered. What happens?', options: ['The sub-process is cancelled', 'An additional token starts the escalation path, and the sub-process continues', 'The process ends', 'Nothing'], correct: [1], explanation: 'Non-interrupting events add a token.' }
    ],
    encyclopedia: ['escalation-event', 'boundary-event']
  },
  {
    id: 'compensation',
    title: 'Compensation concepts',
    level: 5,
    summary: 'Compensation undoes completed work when a later step fails.',
    explanation: `Sometimes completed work must be **undone**: a hotel booking must be cancelled when the payment fails. BPMN models this with **compensation**:

- A **compensation boundary event** (rewind symbol) on an activity, connected by an **association** to a **compensation activity** (“Cancel hotel”) marked with the rewind marker.
- A **compensation throw event** later in the process (“Undo booking”) triggers the compensation of all completed activities in scope.

Compensation is **not** a rollback of data — it is business work that reverses the effect (refund, cancellation letter). BPMN Studio shows compensation in diagrams and explains it, but neither simulator executes compensation; the validator reports this explicitly.`,
    example: { spec: compensation, caption: '“Cancel hotel” compensates “Book hotel” if the payment fails.' },
    demo: { spec: compensation, hint: 'Choose “no” at “Payment OK?” and start. The token animation executes the compensation throw; the performance simulator does not simulate compensation.' },
    mistake: {
      spec: {
        nodes: [
          { id: 'Start', type: 'startEvent', name: 'Trip requested', at: [0, 0] },
          { id: 'Book', type: 'task', name: 'Book hotel', at: [1, 0] },
          { id: 'Pay', type: 'task', name: 'Charge customer', at: [2, 0] },
          { id: 'Ok', type: 'exclusiveGateway', name: 'Payment OK?', at: [3, 0] },
          { id: 'End', type: 'endEvent', name: 'Trip booked', at: [4, -0.8] },
          { id: 'End2', type: 'endEvent', name: 'Trip cancelled', at: [4, 0.8] }
        ],
        flows: [
          { from: 'Start', to: 'Book' },
          { from: 'Book', to: 'Pay' },
          { from: 'Pay', to: 'Ok' },
          { from: 'Ok', to: 'End', name: 'yes' },
          { from: 'Ok', to: 'End2', name: 'no' }
        ]
      },
      title: 'Forgetting to undo',
      text: 'If the payment fails, the trip is “cancelled” — but the hotel remains booked. Either model a compensation for “Book hotel” or an explicit “Cancel hotel” activity on the “no” path.'
    },
    exercise: {
      kind: 'mcq',
      id: 'ex-compensation',
      prompt: 'When is a compensation activity executed?',
      options: ['Always after the activity it compensates', 'Only when compensation is triggered for a completed activity', 'Whenever an error occurs anywhere', 'Before the activity starts'],
      correct: [1],
      explanation: 'Compensation applies to successfully completed activities when a compensation event is thrown.'
    },
    quiz: [
      { id: 'q1', question: 'Which connection links a compensation boundary event to its compensation activity?', options: ['Sequence flow', 'Message flow', 'Association', 'None'], correct: [2], explanation: 'Compensation handlers are not part of the normal sequence flow.' },
      { id: 'q2', question: 'Is compensation the same as a database rollback?', options: ['Yes', 'No — it is business work that reverses an effect'], correct: [1], explanation: 'E.g. cancelling a booking or refunding a payment.' }
    ],
    encyclopedia: ['boundary-event', 'subprocess']
  }
];
