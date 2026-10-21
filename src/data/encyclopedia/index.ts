/**
 * BPMN element encyclopedia: for every element the name, graphical meaning,
 * execution semantics, typical use cases, common mistakes, related concepts
 * and one or more miniature interactive examples.
 */
import type { DiagramSpec } from '../../domain/bpmn/builder';
import { chain, decision, splitJoin } from './patterns';

export type EntryCategory = 'events' | 'activities' | 'gateways' | 'collaboration';

export interface Demo {
  title: string;
  spec: DiagramSpec;
  /** What to try in the interactive demonstration. */
  hint: string;
  /** Whether the token animation makes sense for this demo. */
  animate?: boolean;
}

export interface EncyclopediaEntry {
  id: string;
  name: string;
  category: EntryCategory;
  /** bpmn-js palette/shape type, used for the icon and matching. */
  bpmnType: string;
  /** CSS class of the bpmn-font icon. */
  icon: string;
  summary: string;
  graphical: string;
  semantics: string;
  useCases: string[];
  mistakes: string[];
  related: string[];
  /** Additional explanation sections (e.g. XOR vs AND). */
  sections?: Array<{ title: string; text: string }>;
  demos: Demo[];
  lessonId?: string;
}

const CATEGORY_LABELS: Record<EntryCategory, string> = {
  events: 'Events',
  activities: 'Activities',
  gateways: 'Gateways',
  collaboration: 'Collaboration & artifacts'
};
export { CATEGORY_LABELS };

const startEnd = (start: Partial<DiagramSpec['nodes'][number]>, end: Partial<DiagramSpec['nodes'][number]> = {}) =>
  chain([
    { id: 'Start', type: 'startEvent', name: 'Order received', ...start } as never,
    { id: 'Task', type: 'task', name: 'Handle order' },
    { id: 'End', type: 'endEvent', name: 'Order handled', ...end } as never
  ]);

export const ENTRIES: EncyclopediaEntry[] = [
  // ======================================================================= events
  {
    id: 'start-event',
    name: 'Start Event',
    category: 'events',
    bpmnType: 'bpmn:StartEvent',
    icon: 'bpmn-icon-start-event-none',
    summary: 'Marks where a process instance begins.',
    graphical: 'A circle with a thin single border. An inner symbol (envelope, clock, …) shows the trigger; an empty circle is a “none” start event without a specific trigger.',
    semantics: 'When the start event is triggered, a new process instance is created and a token is placed on each outgoing sequence flow. A start event has no incoming sequence flows.',
    useCases: ['“Order received” — a customer order starts order handling.', '“Every Monday 8:00” (timer start) — a weekly report process.', '“Application submitted” (message start) — a message from another participant starts the process.'],
    mistakes: [
      'Drawing incoming sequence flows into a start event (use a merging gateway after it instead).',
      'Several blank start events in one process — it becomes unclear where an instance begins.',
      'Naming the start event with an activity (“Receive order”) instead of the state that triggers it (“Order received”).'
    ],
    related: ['end-event', 'message-event', 'timer-event', 'sequence-flow'],
    demos: [{ title: 'A process instance starts', spec: startEnd({}), hint: 'Press Start: one token is created at the start event and travels through the process.', animate: true }],
    lessonId: 'events-basics'
  },
  {
    id: 'end-event',
    name: 'End Event',
    category: 'events',
    bpmnType: 'bpmn:EndEvent',
    icon: 'bpmn-icon-end-event-none',
    summary: 'Marks where a path of the process ends.',
    graphical: 'A circle with a thick border. A filled inner symbol shows a result that is thrown (message, error, escalation, …).',
    semantics: 'An end event consumes the token that reaches it. The process instance completes when no tokens are left anywhere — other parallel branches may still be running when one end event is reached.',
    useCases: ['“Order shipped” and “Order rejected” as two distinct business outcomes.', '“Claim settled” with a message end event that informs the customer.'],
    mistakes: [
      'Assuming that reaching one end event stops parallel branches (that is what a terminate end event does).',
      'Using one shared end event for all outcomes — separate, named end events make results visible.',
      'Outgoing sequence flows from an end event (invalid).'
    ],
    related: ['terminate-end-event', 'start-event', 'parallel-gateway'],
    demos: [
      { title: 'Two outcomes', spec: decision('exclusiveGateway', { gateway: 'Order valid?', fa: 'yes', fb: 'no', a: 'Ship order', b: 'Reject order', endA: 'Order shipped', endB: 'Order rejected', start: 'Order received' }), hint: 'Click the gateway to switch the path, then start again: each run ends at a different end event.', animate: true }
    ],
    lessonId: 'events-basics'
  },
  {
    id: 'intermediate-catch-event',
    name: 'Intermediate Catch Event',
    category: 'events',
    bpmnType: 'bpmn:IntermediateCatchEvent',
    icon: 'bpmn-icon-intermediate-event-catch-message',
    summary: 'The process waits for something to happen.',
    graphical: 'A circle with a double thin border and an unfilled (catching) symbol inside, placed in the sequence flow.',
    semantics: 'When the token arrives, it waits at the event until the event occurs (a message arrives, a timer expires, a condition becomes true, …). Then the token continues.',
    useCases: ['Wait for the customer’s payment (message).', 'Wait 3 days before sending a reminder (timer).', 'Wait until stock is available (conditional).'],
    mistakes: [
      'Using a catch event to model an activity (“Receive payment” is better modeled as an event “Payment received” or a receive task).',
      'Forgetting a timeout: if the message never comes, the instance waits forever (use an event-based gateway with a timer).'
    ],
    related: ['intermediate-throw-event', 'message-event', 'timer-event', 'event-based-gateway', 'receive-task'],
    demos: [
      {
        title: 'Waiting for a message',
        spec: chain([
          { id: 'Start', type: 'startEvent', name: 'Invoice sent' },
          { id: 'Wait', type: 'intermediateCatchEvent', event: 'message', name: 'Payment received' },
          { id: 'Task', type: 'task', name: 'Book payment' },
          { id: 'End', type: 'endEvent', name: 'Invoice paid' }
        ]),
        hint: 'Start the process: the token stops at “Payment received”. Click the play button on the event to simulate the incoming payment.',
        animate: true
      }
    ],
    lessonId: 'events-basics'
  },
  {
    id: 'intermediate-throw-event',
    name: 'Intermediate Throw Event',
    category: 'events',
    bpmnType: 'bpmn:IntermediateThrowEvent',
    icon: 'bpmn-icon-intermediate-event-throw-message',
    summary: 'The process signals something and continues immediately.',
    graphical: 'A double-bordered circle with a filled (throwing) symbol. Without a symbol it marks a milestone (“none” intermediate event).',
    semantics: 'The token passes through without waiting; the event is emitted (message sent, signal broadcast, escalation raised). A none intermediate event only documents that a state was reached.',
    useCases: ['“Order confirmed” milestone in the middle of a process.', 'Send a notification message and continue.', 'Raise an escalation to a parent process without stopping work.'],
    mistakes: ['Expecting a throw event to wait for an answer — it does not; model the answer with a catch event.', 'Confusing filled (throw) and unfilled (catch) symbols.'],
    related: ['intermediate-catch-event', 'message-event', 'signal-event', 'escalation-event'],
    demos: [
      {
        title: 'Milestone',
        spec: chain([
          { id: 'Start', type: 'startEvent', name: 'Order received' },
          { id: 'Task1', type: 'task', name: 'Check order' },
          { id: 'Milestone', type: 'intermediateThrowEvent', name: 'Order confirmed' },
          { id: 'Task2', type: 'task', name: 'Ship order' },
          { id: 'End', type: 'endEvent', name: 'Order shipped' }
        ]),
        hint: 'The token passes the milestone without stopping.',
        animate: true
      }
    ]
  },
  {
    id: 'timer-event',
    name: 'Timer Event',
    category: 'events',
    bpmnType: 'bpmn:IntermediateCatchEvent',
    icon: 'bpmn-icon-intermediate-event-catch-timer',
    summary: 'Something happens at a point in time or after a duration.',
    graphical: 'A clock symbol inside an event. As a start event: a schedule; as an intermediate event: a delay; on an activity boundary: a deadline.',
    semantics: 'A timer catch event lets the token wait until the time condition is met (date, duration such as PT2H, or cycle). As a boundary event, it fires if the activity is still running when the time has elapsed.',
    useCases: ['Start a payroll run on the last working day of each month.', 'Wait 14 days before sending a payment reminder.', 'Escalate if an approval takes longer than 2 days (boundary timer).'],
    mistakes: ['Using a timer to model work duration — activities take time on their own; timers model waiting or deadlines.', 'Timer boundary events without an outgoing flow — the deadline has no consequence.'],
    related: ['boundary-event', 'event-based-gateway', 'intermediate-catch-event'],
    demos: [
      {
        title: 'Waiting for a timeout',
        spec: chain([
          { id: 'Start', type: 'startEvent', name: 'Invoice overdue' },
          { id: 'Wait', type: 'intermediateCatchEvent', event: 'timer', timer: 'P14D', name: '14 days' },
          { id: 'Task', type: 'sendTask', name: 'Send reminder' },
          { id: 'End', type: 'endEvent', name: 'Reminder sent' }
        ]),
        hint: 'The token waits at the timer. In the animation, trigger the timer manually to let time pass.',
        animate: true
      }
    ],
    lessonId: 'timer-events'
  },
  {
    id: 'message-event',
    name: 'Message Event',
    category: 'events',
    bpmnType: 'bpmn:IntermediateCatchEvent',
    icon: 'bpmn-icon-intermediate-event-catch-message',
    summary: 'Communication with another participant.',
    graphical: 'An envelope: white (catching) when a message is received, black (throwing) when a message is sent.',
    semantics: 'A message catch event waits for a specific message from another participant (pool). A message throw event sends one. Messages are directed: they have exactly one sender and one receiver, drawn as a message flow between pools.',
    useCases: ['“Order received” message start event from the customer pool.', '“Confirmation received” while waiting for a supplier.', 'Message end event “Invoice sent”.'],
    mistakes: ['Message flows inside one pool (use sequence flows).', 'Using messages to broadcast to everyone — that is a signal.'],
    related: ['message-flow', 'pool', 'signal-event', 'receive-task', 'send-task'],
    demos: [
      {
        title: 'Message start event',
        spec: startEnd({ event: 'message', name: 'Order received' }),
        hint: 'A message start event is triggered by an incoming message. Start it with the play button.',
        animate: true
      }
    ],
    lessonId: 'message-flows'
  },
  {
    id: 'error-event',
    name: 'Error Event',
    category: 'events',
    bpmnType: 'bpmn:EndEvent',
    icon: 'bpmn-icon-end-event-error',
    summary: 'A critical problem aborts the current scope.',
    graphical: 'A lightning symbol. Thrown by an error end event; caught by an interrupting error boundary event on a sub-process (or by an error start event of an event sub-process).',
    semantics: 'An error end event terminates its sub-process and throws the error to the enclosing scope. The matching error boundary event interrupts the sub-process and the token continues along the exception flow. Errors are always interrupting.',
    useCases: ['Payment failed inside a “Process payment” sub-process → cancel the order.', 'Technical failure of a service call handled as a business exception.'],
    mistakes: ['Throwing an error without a boundary event that catches it — the error propagates upwards and may end the whole process.', 'Using error events for normal business outcomes (“customer rejected offer”) — use gateways and end events.', 'Non-interrupting error events do not exist.'],
    related: ['boundary-event', 'subprocess', 'escalation-event'],
    demos: [
      {
        title: 'Error inside a sub-process',
        spec: {
          nodes: [
            { id: 'Start', type: 'startEvent', name: 'Order placed', at: [0, 0] },
            { id: 'Sub', type: 'subProcess', name: 'Process payment', at: [2, 0] },
            { id: 'SStart', type: 'startEvent', at: [1, 0], parent: 'Sub' },
            { id: 'Charge', type: 'serviceTask', name: 'Charge card', at: [2, 0], parent: 'Sub' },
            { id: 'Ok', type: 'exclusiveGateway', name: 'Paid?', at: [3, 0], parent: 'Sub' },
            { id: 'SEnd', type: 'endEvent', name: 'Paid', at: [4, 0], parent: 'Sub' },
            { id: 'SErr', type: 'endEvent', event: 'error', name: 'Payment failed', at: [4, 1], parent: 'Sub' },
            { id: 'Catch', type: 'boundaryEvent', event: 'error', attachedTo: 'Sub', boundaryOffset: 0.85 },
            { id: 'Ship', type: 'task', name: 'Ship order', at: [5.5, 0] },
            { id: 'End', type: 'endEvent', name: 'Shipped', at: [6.5, 0] },
            { id: 'Cancel', type: 'task', name: 'Cancel order', at: [5.5, 2.4] },
            { id: 'End2', type: 'endEvent', name: 'Cancelled', at: [6.5, 2.4] }
          ],
          flows: [
            { from: 'Start', to: 'Sub', waypoints: [[178, 110], [256, 110]] },
            { from: 'SStart', to: 'Charge' },
            { from: 'Charge', to: 'Ok' },
            { from: 'Ok', to: 'SEnd', name: 'yes' },
            { from: 'Ok', to: 'SErr', name: 'no' },
            { from: 'Sub', to: 'Ship', waypoints: [[814, 110], [935, 110]] },
            { from: 'Ship', to: 'End' },
            { from: 'Catch', to: 'Cancel' },
            { from: 'Cancel', to: 'End2' }
          ]
        },
        hint: 'Click the “Paid?” gateway to select “no”, then start: the error end event interrupts the sub-process and the boundary event takes over.',
        animate: true
      }
    ],
    lessonId: 'error-handling'
  },
  {
    id: 'escalation-event',
    name: 'Escalation Event',
    category: 'events',
    bpmnType: 'bpmn:IntermediateThrowEvent',
    icon: 'bpmn-icon-intermediate-event-throw-escalation',
    summary: 'Hand a situation to a higher responsibility — without necessarily aborting.',
    graphical: 'An upward arrow (chevron). Can be thrown by intermediate or end events and caught by interrupting or non-interrupting (dashed) boundary events.',
    semantics: 'Like an error, an escalation travels from a sub-process to its parent. Unlike an error, it can be caught by a non-interrupting boundary event so the sub-process continues while someone else reacts.',
    useCases: ['Inform the team lead when a ticket is complex, while the agent keeps working.', 'Escalate a large discount request to sales management.'],
    mistakes: ['Using escalation for technical failures (use error).', 'Forgetting that an escalation needs a catching boundary or event sub-process to have an effect.'],
    related: ['error-event', 'boundary-event', 'subprocess'],
    demos: [
      {
        title: 'Escalation as a result',
        spec: chain([
          { id: 'Start', type: 'startEvent', name: 'Ticket received' },
          { id: 'Analyse', type: 'task', name: 'Analyse ticket' },
          { id: 'Esc', type: 'intermediateThrowEvent', event: 'escalation', name: 'Complex case' },
          { id: 'Work', type: 'task', name: 'Continue analysis' },
          { id: 'End', type: 'endEvent', name: 'Analysed' }
        ]),
        hint: 'The escalation is thrown and the process continues. In a sub-process, a boundary event on the sub-process would catch it.',
        animate: true
      }
    ],
    lessonId: 'escalations'
  },
  {
    id: 'signal-event',
    name: 'Signal Event',
    category: 'events',
    bpmnType: 'bpmn:IntermediateCatchEvent',
    icon: 'bpmn-icon-intermediate-event-catch-signal',
    summary: 'A broadcast that any interested process can receive.',
    graphical: 'A triangle: unfilled when catching, filled when throwing.',
    semantics: 'A signal is broadcast without a specific receiver — every process instance waiting for that signal reacts. Messages, in contrast, are addressed to one participant.',
    useCases: ['“Storm warning” stops all outdoor installation processes.', '“Price list updated” lets waiting quotes recalculate.'],
    mistakes: ['Drawing message flows for signals (signals have no flows).', 'Using signals for one-to-one communication (use messages).'],
    related: ['message-event', 'intermediate-catch-event'],
    demos: [
      {
        title: 'Waiting for a broadcast',
        spec: chain([
          { id: 'Start', type: 'startEvent', name: 'Installation planned' },
          { id: 'Wait', type: 'intermediateCatchEvent', event: 'signal', name: 'Weather OK' },
          { id: 'Task', type: 'task', name: 'Install panels' },
          { id: 'End', type: 'endEvent', name: 'Installed' }
        ]),
        hint: 'Trigger the signal event on the canvas to continue.',
        animate: true
      }
    ]
  },
  {
    id: 'conditional-event',
    name: 'Conditional Event',
    category: 'events',
    bpmnType: 'bpmn:IntermediateCatchEvent',
    icon: 'bpmn-icon-intermediate-event-catch-condition',
    summary: 'Reacts when a business condition becomes true.',
    graphical: 'A lined sheet of paper inside the event.',
    semantics: 'The token waits until the condition (e.g. “stock ≥ order quantity”) becomes true. As a boundary event it fires when the condition becomes true while the activity runs.',
    useCases: ['Continue when stock is available.', 'Interrupt a calculation when the customer cancels (condition: order.status = cancelled).'],
    mistakes: ['Using a conditional event where a decision (gateway) is needed — events wait, gateways decide immediately.'],
    related: ['intermediate-catch-event', 'exclusive-gateway'],
    demos: [
      {
        title: 'Wait for a condition',
        spec: chain([
          { id: 'Start', type: 'startEvent', name: 'Order accepted' },
          { id: 'Wait', type: 'intermediateCatchEvent', event: 'conditional', name: 'Stock available' },
          { id: 'Task', type: 'task', name: 'Pick goods' },
          { id: 'End', type: 'endEvent', name: 'Goods picked' }
        ]),
        hint: 'The token waits until you trigger the condition.',
        animate: true
      }
    ]
  },
  {
    id: 'boundary-event',
    name: 'Boundary Event',
    category: 'events',
    bpmnType: 'bpmn:BoundaryEvent',
    icon: 'bpmn-icon-intermediate-event-catch-non-interrupting-timer',
    summary: 'An event that can occur while an activity is running.',
    graphical: 'An intermediate catch event attached to the border of an activity. Solid double border = interrupting; dashed border = non-interrupting.',
    semantics: 'While the activity is active, the boundary event listens. If it occurs and is interrupting, the activity is cancelled and the token leaves through the boundary event’s exception flow. If it is non-interrupting, an additional token is created and the activity continues.',
    useCases: ['Timer: cancel a quote after 30 days without answer.', 'Message: customer cancels the order while it is being packed.', 'Non-interrupting timer: remind the approver after 2 days, but keep waiting.'],
    mistakes: ['Forgetting the outgoing flow of the boundary event.', 'Using an interrupting event where the work should continue (use the dashed, non-interrupting variant).', 'Placing the event next to the activity instead of on its border (then it is a normal intermediate event).'],
    related: ['timer-event', 'error-event', 'escalation-event', 'subprocess'],
    demos: [
      {
        title: 'Interrupting timer',
        spec: {
          nodes: [
            { id: 'Start', type: 'startEvent', name: 'Quote sent', at: [0, 0] },
            { id: 'Wait', type: 'receiveTask', name: 'Wait for answer', at: [1, 0] },
            { id: 'Timer', type: 'boundaryEvent', event: 'timer', timer: 'P30D', name: '30 days', attachedTo: 'Wait' },
            { id: 'Book', type: 'task', name: 'Book order', at: [2, 0] },
            { id: 'End', type: 'endEvent', name: 'Order booked', at: [3, 0] },
            { id: 'Close', type: 'task', name: 'Close quote', at: [2, 1.2] },
            { id: 'End2', type: 'endEvent', name: 'Quote expired', at: [3, 1.2] }
          ],
          flows: [
            { from: 'Start', to: 'Wait' },
            { from: 'Wait', to: 'Book' },
            { from: 'Book', to: 'End' },
            { from: 'Timer', to: 'Close' },
            { from: 'Close', to: 'End2' }
          ]
        },
        hint: 'Start, then either trigger the receive task (answer arrives) or the timer (30 days pass). The timer cancels the waiting activity.',
        animate: true
      }
    ],
    lessonId: 'boundary-events'
  },
  {
    id: 'terminate-end-event',
    name: 'Terminate End Event',
    category: 'events',
    bpmnType: 'bpmn:EndEvent',
    icon: 'bpmn-icon-end-event-terminate',
    summary: 'Ends the whole process instance immediately.',
    graphical: 'An end event with a filled black circle inside.',
    semantics: 'When a token reaches a terminate end event, all other tokens of the same process (or sub-process) instance are removed and running activities are cancelled.',
    useCases: ['A fraud check fails while other checks are still running in parallel — stop everything.', 'The first of several parallel searches that finds a result ends the search.'],
    mistakes: ['Using terminate where a normal end event would do — it hides parallel work being cancelled.', 'Expecting it to end only the current branch.'],
    related: ['end-event', 'parallel-gateway'],
    demos: [
      {
        title: 'Stop parallel work',
        spec: {
          nodes: [
            { id: 'Start', type: 'startEvent', name: 'Application received', at: [0, 0] },
            { id: 'Split', type: 'parallelGateway', at: [1, 0] },
            { id: 'Fraud', type: 'task', name: 'Fraud check', at: [2, -0.8] },
            { id: 'Credit', type: 'task', name: 'Credit check', at: [2, 0.8] },
            { id: 'Kill', type: 'endEvent', event: 'terminate', name: 'Fraud detected', at: [3, -0.8] },
            { id: 'End', type: 'endEvent', name: 'Checked', at: [3, 0.8] }
          ],
          flows: [
            { from: 'Start', to: 'Split' },
            { from: 'Split', to: 'Fraud' },
            { from: 'Split', to: 'Credit' },
            { from: 'Fraud', to: 'Kill' },
            { from: 'Credit', to: 'End' }
          ]
        },
        hint: 'Turn on step mode and complete “Fraud check” first: the terminate end event removes the token waiting at “Credit check”.',
        animate: true
      }
    ]
  },

  // ======================================================================= activities
  {
    id: 'task',
    name: 'Task',
    category: 'activities',
    bpmnType: 'bpmn:Task',
    icon: 'bpmn-icon-task',
    summary: 'An atomic unit of work.',
    graphical: 'A rectangle with rounded corners. A small icon in the top-left corner can specify the task type (user, service, …).',
    semantics: 'A token arriving at a task starts it; when the work is done, a token is placed on every outgoing sequence flow. With several incoming flows, the task starts once per arriving token (it does not wait for the others).',
    useCases: ['“Check invoice”, “Approve vacation request”, “Ship parcel”.'],
    mistakes: [
      'Names that are nouns (“Invoice”) instead of verb–object (“Check invoice”).',
      'Several outgoing flows without a gateway — this is an implicit parallel split, not a decision.',
      'Several incoming flows from parallel branches — the task runs multiple times; join with a parallel gateway first.'
    ],
    related: ['user-task', 'service-task', 'subprocess', 'sequence-flow'],
    demos: [{ title: 'Sequence of tasks', spec: chain([{ id: 'Start', type: 'startEvent', name: 'Invoice received' }, { id: 'A', type: 'task', name: 'Check invoice' }, { id: 'B', type: 'task', name: 'Approve invoice' }, { id: 'C', type: 'task', name: 'Pay invoice' }, { id: 'End', type: 'endEvent', name: 'Invoice paid' }]), hint: 'Watch the token move from task to task. Use step mode to complete one task at a time.', animate: true }],
    lessonId: 'process-basics'
  },
  {
    id: 'user-task',
    name: 'User Task',
    category: 'activities',
    bpmnType: 'bpmn:UserTask',
    icon: 'bpmn-icon-user-task',
    summary: 'Work done by a person with the support of a software system.',
    graphical: 'A task with a small person icon.',
    semantics: 'Executes like a task. In workflow systems, a user task appears in a person’s work list (e.g. a form to fill in).',
    useCases: ['Approve a request in the HR portal.', 'Review a loan application on screen.'],
    mistakes: ['Using user tasks for work done without any IT support (that is a manual task).'],
    related: ['manual-task', 'service-task', 'lane'],
    demos: [{ title: 'User task', spec: chain([{ id: 'Start', type: 'startEvent', name: 'Request submitted' }, { id: 'A', type: 'userTask', name: 'Approve request' }, { id: 'End', type: 'endEvent', name: 'Request approved' }]), hint: 'Execution semantics are the same as for every task.', animate: true }]
  },
  {
    id: 'service-task',
    name: 'Service Task',
    category: 'activities',
    bpmnType: 'bpmn:ServiceTask',
    icon: 'bpmn-icon-service',
    summary: 'Work performed automatically by a software service.',
    graphical: 'A task with a gear icon.',
    semantics: 'Executes like a task, without human involvement: a web service, API or application is called.',
    useCases: ['Check credit score via an external API.', 'Create an invoice in the ERP system.'],
    mistakes: ['Hiding manual work behind a service task; in a simulation, service tasks are typically fast and need no human resources.'],
    related: ['script-task', 'business-rule-task', 'user-task'],
    demos: [{ title: 'Automated step', spec: chain([{ id: 'Start', type: 'startEvent', name: 'Order received' }, { id: 'A', type: 'serviceTask', name: 'Check credit score' }, { id: 'B', type: 'userTask', name: 'Confirm order' }, { id: 'End', type: 'endEvent', name: 'Order confirmed' }]), hint: 'Service and user tasks behave identically in the token flow; the difference is who performs them.', animate: true }]
  },
  {
    id: 'manual-task',
    name: 'Manual Task',
    category: 'activities',
    bpmnType: 'bpmn:ManualTask',
    icon: 'bpmn-icon-manual',
    summary: 'Physical work without software support.',
    graphical: 'A task with a hand icon.',
    semantics: 'Executes like a task; no IT system is involved.',
    useCases: ['Pack the parcel.', 'Deliver documents to the archive.'],
    mistakes: ['Using manual tasks when the person works in an IT system (user task).'],
    related: ['user-task', 'task'],
    demos: [{ title: 'Physical work', spec: chain([{ id: 'Start', type: 'startEvent', name: 'Order picked' }, { id: 'A', type: 'manualTask', name: 'Pack parcel' }, { id: 'End', type: 'endEvent', name: 'Parcel packed' }]), hint: 'Same token semantics as any task.', animate: true }]
  },
  {
    id: 'script-task',
    name: 'Script Task',
    category: 'activities',
    bpmnType: 'bpmn:ScriptTask',
    icon: 'bpmn-icon-script',
    summary: 'A script executed by the process engine itself.',
    graphical: 'A task with a scroll icon.',
    semantics: 'Executes like a task; the engine runs a script (e.g. a calculation) without calling external services.',
    useCases: ['Calculate the total amount including tax.', 'Format data for the next step.'],
    mistakes: ['Long-running or external work in a script task (use a service task).'],
    related: ['service-task', 'business-rule-task'],
    demos: [{ title: 'Calculation', spec: chain([{ id: 'Start', type: 'startEvent', name: 'Cart submitted' }, { id: 'A', type: 'scriptTask', name: 'Calculate total' }, { id: 'End', type: 'endEvent', name: 'Total calculated' }]), hint: 'Same token semantics as any task.', animate: true }]
  },
  {
    id: 'business-rule-task',
    name: 'Business Rule Task',
    category: 'activities',
    bpmnType: 'bpmn:BusinessRuleTask',
    icon: 'bpmn-icon-business-rule',
    summary: 'Evaluates business rules, e.g. a decision table.',
    graphical: 'A task with a small table icon.',
    semantics: 'Executes like a task; typically evaluates a DMN decision whose result is used by a following gateway.',
    useCases: ['Determine the discount category.', 'Classify the risk of an application.'],
    mistakes: ['Encoding complex decision logic as a cascade of gateways instead of a rule task + one gateway.'],
    related: ['exclusive-gateway', 'service-task'],
    demos: [{ title: 'Rule then route', spec: decision('exclusiveGateway', { before: 'Classify risk', gateway: 'Risk?', fa: 'low', fb: 'high', a: 'Approve automatically', b: 'Review manually', endA: 'Approved', endB: 'Reviewed', start: 'Application received' }), hint: 'The rule task computes the result; the gateway routes on it.', animate: true }]
  },
  {
    id: 'send-task',
    name: 'Send Task',
    category: 'activities',
    bpmnType: 'bpmn:SendTask',
    icon: 'bpmn-icon-send',
    summary: 'Sends a message to another participant.',
    graphical: 'A task with a filled envelope.',
    semantics: 'Executes like a task; on completion a message is sent along its outgoing message flow.',
    useCases: ['Send the invoice to the customer.', 'Send a purchase order to a supplier.'],
    mistakes: ['A send task with an incoming message flow — sending and receiving are separate tasks.'],
    related: ['receive-task', 'message-flow', 'message-event'],
    demos: [{ title: 'Sending a message', spec: chain([{ id: 'Start', type: 'startEvent', name: 'Order completed' }, { id: 'A', type: 'sendTask', name: 'Send invoice' }, { id: 'End', type: 'endEvent', name: 'Invoice sent' }]), hint: 'The token passes like any task; the message would travel to another pool.', animate: true }]
  },
  {
    id: 'receive-task',
    name: 'Receive Task',
    category: 'activities',
    bpmnType: 'bpmn:ReceiveTask',
    icon: 'bpmn-icon-receive',
    summary: 'Waits for a message from another participant.',
    graphical: 'A task with an unfilled envelope.',
    semantics: 'The token waits at the task until the expected message arrives; then the task completes. It behaves like a message catch event, but can carry boundary events and loop markers.',
    useCases: ['Wait for the signed contract.', 'Receive the supplier’s confirmation.'],
    mistakes: ['Modeling a receive task when no message flow comes from another participant.'],
    related: ['send-task', 'intermediate-catch-event', 'event-based-gateway'],
    demos: [{ title: 'Waiting for a message', spec: chain([{ id: 'Start', type: 'startEvent', name: 'Contract sent' }, { id: 'A', type: 'receiveTask', name: 'Receive signed contract' }, { id: 'B', type: 'task', name: 'Archive contract' }, { id: 'End', type: 'endEvent', name: 'Contract archived' }]), hint: 'The token waits at the receive task until you trigger it.', animate: true }]
  },
  {
    id: 'subprocess',
    name: 'Sub-Process',
    category: 'activities',
    bpmnType: 'bpmn:SubProcess',
    icon: 'bpmn-icon-subprocess-expanded',
    summary: 'An activity whose content is a process of its own.',
    graphical: 'A large rounded rectangle containing a process (expanded) or a task with a “+” marker (collapsed).',
    semantics: 'When the token arrives, the sub-process starts its own inner start event. It completes when no tokens are left inside; then the outer token continues. Boundary events attached to the sub-process cover its whole content.',
    useCases: ['Group “Process payment” into one step for readability.', 'Define a scope for error handling: a boundary event cancels all inner work.'],
    mistakes: ['Sequence flows crossing the sub-process border (invalid).', 'Typed start events inside an embedded sub-process — it must use a blank start event.'],
    related: ['call-activity', 'boundary-event', 'error-event'],
    demos: [
      {
        title: 'Embedded sub-process',
        spec: {
          nodes: [
            { id: 'Start', type: 'startEvent', name: 'Order received', at: [0, 0] },
            { id: 'Sub', type: 'subProcess', name: 'Prepare shipment', at: [2, 0] },
            { id: 'SStart', type: 'startEvent', at: [1, 0], parent: 'Sub' },
            { id: 'Pick', type: 'task', name: 'Pick goods', at: [2, 0], parent: 'Sub' },
            { id: 'Pack', type: 'task', name: 'Pack goods', at: [3, 0], parent: 'Sub' },
            { id: 'SEnd', type: 'endEvent', at: [4, 0], parent: 'Sub' },
            { id: 'Ship', type: 'task', name: 'Ship goods', at: [5.4, 0] },
            { id: 'End', type: 'endEvent', name: 'Shipped', at: [6.4, 0] }
          ],
          flows: [
            { from: 'Start', to: 'Sub', waypoints: [[178, 110], [256, 110]] },
            { from: 'SStart', to: 'Pick' },
            { from: 'Pick', to: 'Pack' },
            { from: 'Pack', to: 'SEnd' },
            { from: 'Sub', to: 'Ship', waypoints: [[814, 110], [920, 110]] },
            { from: 'Ship', to: 'End' }
          ]
        },
        hint: 'The outer token waits while the inner process runs; it continues when the inner end event is reached.',
        animate: true
      }
    ],
    lessonId: 'subprocesses'
  },
  {
    id: 'call-activity',
    name: 'Call Activity',
    category: 'activities',
    bpmnType: 'bpmn:CallActivity',
    icon: 'bpmn-icon-call-activity',
    summary: 'Invokes a separate, reusable process.',
    graphical: 'A task or collapsed sub-process with a thick border.',
    semantics: 'Like a sub-process, but the called process is defined elsewhere and can be reused by many processes (e.g. “Check customer creditworthiness”). The caller waits until the called process completes.',
    useCases: ['A shared “Identify customer” process used by sales and service.', 'A corporate “Approve expense” process.'],
    mistakes: ['Copying the same sub-process into many models instead of calling one reusable process.'],
    related: ['subprocess', 'task'],
    demos: [{ title: 'Calling a global process', spec: chain([{ id: 'Start', type: 'startEvent', name: 'Request received' }, { id: 'A', type: 'callActivity', name: 'Identify customer' }, { id: 'B', type: 'task', name: 'Handle request' }, { id: 'End', type: 'endEvent', name: 'Request handled' }]), hint: 'In the animation the call activity behaves like a task.', animate: true }]
  },
  {
    id: 'loop-activity',
    name: 'Loop Activity',
    category: 'activities',
    bpmnType: 'bpmn:Task',
    icon: 'bpmn-icon-loop-marker',
    summary: 'An activity that repeats while a condition holds.',
    graphical: 'A task with a circular arrow marker at the bottom.',
    semantics: 'The activity is executed repeatedly (like a do-while loop) until its loop condition is no longer true; only then does the token continue. It is a compact alternative to a loop drawn with gateways.',
    useCases: ['Revise the draft until the reviewer is satisfied.', 'Retry a call up to three times.'],
    mistakes: ['Using a loop marker when every iteration contains several different steps (draw the loop with gateways instead).', 'Confusing loop (sequential repetition with a condition) with multi-instance (a known number of instances).'],
    related: ['multi-instance-activity', 'exclusive-gateway'],
    demos: [{ title: 'Loop marker', spec: chain([{ id: 'Start', type: 'startEvent', name: 'Draft needed' }, { id: 'A', type: 'task', name: 'Revise draft', loop: 'standard' }, { id: 'End', type: 'endEvent', name: 'Draft accepted' }]), hint: 'The animation treats loop activities as one execution; the performance simulator can repeat them with a probability.', animate: true }],
    lessonId: 'loops'
  },
  {
    id: 'multi-instance-activity',
    name: 'Multi-instance Activity',
    category: 'activities',
    bpmnType: 'bpmn:Task',
    icon: 'bpmn-icon-parallel-mi-marker',
    summary: 'An activity executed once per item of a collection.',
    graphical: 'Three vertical lines (parallel instances) or three horizontal lines (sequential instances) at the bottom of the task.',
    semantics: 'The activity is instantiated several times — for each order line, each reviewer, … Parallel instances run concurrently; sequential instances one after another. The activity completes when all instances are done (unless a completion condition says otherwise).',
    useCases: ['Check every line of an order (parallel).', 'Collect approvals from three managers (parallel or sequential).'],
    mistakes: ['Drawing the same task three times in parallel branches instead of using multi-instance.', 'Confusing it with the loop marker.'],
    related: ['loop-activity', 'parallel-gateway'],
    demos: [{ title: 'Parallel instances', spec: chain([{ id: 'Start', type: 'startEvent', name: 'Order received' }, { id: 'A', type: 'task', name: 'Check order line', loop: 'parallel', loopCardinality: 3 }, { id: 'End', type: 'endEvent', name: 'Order checked' }]), hint: 'The animation shows one execution; the performance simulator executes one instance per item (here 3) and needs a free worker for each.', animate: true }]
  },

  // ======================================================================= gateways
  {
    id: 'exclusive-gateway',
    name: 'Exclusive Gateway (XOR)',
    category: 'gateways',
    bpmnType: 'bpmn:ExclusiveGateway',
    icon: 'bpmn-icon-gateway-xor',
    summary: 'A decision: exactly one of several paths is taken.',
    graphical: 'A diamond, empty or with an “X”. As a split it is usually labeled with a question; its outgoing flows with the answers.',
    semantics: 'Split: the conditions of the outgoing flows are evaluated in order and the token takes exactly one path (the first whose condition is true, or the default flow). Merge: every arriving token passes through immediately — it does not wait for other branches.',
    useCases: ['“Order valid?” — yes: ship; no: reject.', 'Merging alternative paths before a common next step.'],
    mistakes: ['Unlabeled outgoing flows — nobody knows when which path is taken.', 'Overlapping or incomplete conditions (no default flow).', 'Closing an XOR split with a parallel join → deadlock, because only one branch delivers a token.'],
    related: ['parallel-gateway', 'inclusive-gateway', 'sequence-flow'],
    sections: [
      { title: 'XOR split vs. XOR merge', text: 'The same symbol is used for deciding (one incoming, several outgoing) and merging (several incoming, one outgoing). A merge does not synchronize: if two tokens arrive, two tokens leave.' }
    ],
    demos: [
      { title: 'A decision', spec: splitJoin('exclusiveGateway', 'exclusiveGateway', { split: 'Approved?', fa: 'yes', fb: 'no', a: 'Grant loan', b: 'Send rejection', c: 'Archive file', start: 'Application received', end: 'Application closed' }), hint: 'Click the “Approved?” gateway to choose the route, then start. Exactly one branch runs; the merge passes the token on.', animate: true },
      { title: 'Mistake: XOR split + AND join', spec: splitJoin('exclusiveGateway', 'parallelGateway', { split: 'Approved?', fa: 'yes', fb: 'no', a: 'Grant loan', b: 'Send rejection', c: 'Archive file' }), hint: 'Start: only one branch delivers a token, the parallel join waits for the other one forever — a deadlock.', animate: true }
    ],
    lessonId: 'xor-gateway'
  },
  {
    id: 'parallel-gateway',
    name: 'Parallel Gateway (AND)',
    category: 'gateways',
    bpmnType: 'bpmn:ParallelGateway',
    icon: 'bpmn-icon-gateway-parallel',
    summary: 'Concurrency: all paths are taken, and joined again.',
    graphical: 'A diamond with a “+”. No conditions on its outgoing flows and usually no label.',
    semantics: 'Split: one token in, one token out on every outgoing flow — the branches run concurrently (in any order or at the same time). Join: waits until a token has arrived on every incoming flow, then emits one token (synchronization).',
    useCases: ['Pack goods and send the invoice at the same time.', 'Collect results of several independent checks before deciding.'],
    mistakes: [
      'Using it for a decision — conditions on outgoing flows are ignored; all paths run.',
      'Joining parallel branches with an exclusive gateway → the following work runs twice (lack of synchronization).',
      'Joining with a parallel gateway after an exclusive split → deadlock.'
    ],
    related: ['exclusive-gateway', 'inclusive-gateway', 'terminate-end-event'],
    sections: [
      { title: 'Parallel branching', text: 'The split does not mean “at the same time”, but “independently”: each branch may run whenever its resources allow. The order between the branches is not defined.' },
      { title: 'Concurrent token execution', text: 'After the split, the instance holds several tokens at once — one per branch. Each token moves independently of the others.' },
      { title: 'Synchronization behavior', text: 'The join keeps arriving tokens until every incoming flow has delivered one. Only then does it consume them and emit a single token. Faster branches therefore wait for the slowest one — the cycle time of the parallel part is the duration of its longest branch.' },
      { title: 'XOR vs. AND', text: '- XOR split: exactly one path. AND split: all paths.\n- XOR merge: passes each token immediately. AND join: waits for one token from each incoming flow.\n- Conditions only make sense on XOR (and OR) splits.' },
      { title: 'Risks of improper gateway pairing', text: '- XOR split closed by AND join: the join waits for a branch that was never started → deadlock.\n- AND split closed by XOR merge: both tokens pass the merge → the following activities run twice.\nPair each split with a join of the same type.' }
    ],
    demos: [
      { title: 'Split and synchronize', spec: splitJoin('parallelGateway', 'parallelGateway', { a: 'Pack goods', b: 'Send invoice', c: 'Ship order', start: 'Order accepted', end: 'Order shipped' }), hint: 'Start: the split creates two tokens. Turn on step mode to see the join wait until both branches have finished.', animate: true },
      { title: 'Mistake: AND split + XOR merge', spec: splitJoin('parallelGateway', 'exclusiveGateway', { a: 'Pack goods', b: 'Send invoice', c: 'Ship order', start: 'Order accepted', end: 'Order shipped' }), hint: 'Start and watch “Ship order”: it runs twice because the XOR merge does not wait.', animate: true },
      { title: 'Mistake: XOR split + AND join', spec: splitJoin('exclusiveGateway', 'parallelGateway', { split: 'Express?', fa: 'yes', fb: 'no', a: 'Ship express', b: 'Ship standard', c: 'Send tracking' }), hint: 'Start: the parallel join waits forever for the branch that was not chosen.', animate: true }
    ],
    lessonId: 'and-gateway'
  },
  {
    id: 'inclusive-gateway',
    name: 'Inclusive Gateway (OR)',
    category: 'gateways',
    bpmnType: 'bpmn:InclusiveGateway',
    icon: 'bpmn-icon-gateway-or',
    summary: 'One or more paths are taken, depending on conditions.',
    graphical: 'A diamond with a circle inside.',
    semantics: 'Split: every outgoing flow whose condition is true receives a token (at least one; otherwise the default flow). Join: waits for all tokens that were activated and can still arrive — it knows which branches are running.',
    useCases: ['“Which tests are needed?” — blood test and/or X-ray.', 'Notify by e-mail and/or SMS according to customer preferences.'],
    mistakes: ['Joining an inclusive split with a parallel gateway (deadlock if not all branches were taken) or an exclusive gateway (duplication).', 'Overusing OR where the cases are actually exclusive.'],
    related: ['exclusive-gateway', 'parallel-gateway'],
    demos: [{ title: 'One or more branches', spec: splitJoin('inclusiveGateway', 'inclusiveGateway', { split: 'Which tests?', fa: 'blood test', fb: 'X-ray', a: 'Take blood sample', b: 'Take X-ray', c: 'Diagnose', start: 'Patient arrived', end: 'Diagnosed' }), hint: 'Click the split gateway to choose which branches are active, then start. The join waits exactly for those branches.', animate: true }],
    lessonId: 'or-gateway'
  },
  {
    id: 'event-based-gateway',
    name: 'Event-based Gateway',
    category: 'gateways',
    bpmnType: 'bpmn:EventBasedGateway',
    icon: 'bpmn-icon-gateway-eventbased',
    summary: 'A race between events: whichever happens first decides the path.',
    graphical: 'A diamond containing a pentagon inside a double circle. It is followed directly by catch events or receive tasks.',
    semantics: 'The token waits at the gateway. The first of the subsequent events to occur (message, timer, signal, …) wins; the other alternatives are discarded. The decision is made by the environment, not by data.',
    useCases: ['Wait for the customer’s answer, but at most 7 days (message vs. timer).', 'Accept whichever supplier confirms first.'],
    mistakes: ['Putting tasks directly after the gateway (only catch events and receive tasks are allowed).', 'Using data conditions — those need an exclusive gateway.'],
    related: ['exclusive-gateway', 'timer-event', 'message-event', 'receive-task'],
    demos: [
      {
        title: 'Message or timeout',
        spec: {
          nodes: [
            { id: 'Start', type: 'startEvent', name: 'Offer sent', at: [0, 0] },
            { id: 'Gw', type: 'eventBasedGateway', at: [1, 0] },
            { id: 'Msg', type: 'intermediateCatchEvent', event: 'message', name: 'Answer received', at: [2, -0.8] },
            { id: 'Tmr', type: 'intermediateCatchEvent', event: 'timer', timer: 'P7D', name: '7 days', at: [2, 0.8] },
            { id: 'A', type: 'task', name: 'Process answer', at: [3, -0.8] },
            { id: 'B', type: 'task', name: 'Close offer', at: [3, 0.8] },
            { id: 'E1', type: 'endEvent', name: 'Answered', at: [4, -0.8] },
            { id: 'E2', type: 'endEvent', name: 'Expired', at: [4, 0.8] }
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
        },
        hint: 'Start, then trigger either event: the one you trigger first wins and the other disappears.',
        animate: true
      }
    ],
    lessonId: 'event-based-gateway'
  },
  {
    id: 'complex-gateway',
    name: 'Complex Gateway',
    category: 'gateways',
    bpmnType: 'bpmn:ComplexGateway',
    icon: 'bpmn-icon-gateway-complex',
    summary: 'Synchronization with custom rules, e.g. “2 of 3”.',
    graphical: 'A diamond with an asterisk.',
    semantics: 'Behavior is defined by an activation condition, e.g. continue as soon as two of three reviews have arrived. Because its semantics are custom, many tools — including BPMN Studio’s simulators — do not execute it.',
    useCases: ['Continue after 2 of 3 expert reviews.'],
    mistakes: ['Using it without a clearly documented condition.', 'Using it where standard gateways suffice.'],
    related: ['parallel-gateway', 'inclusive-gateway'],
    demos: [{ title: 'Two out of three', spec: splitJoin('parallelGateway', 'complexGateway', { a: 'Review A', b: 'Review B', c: 'Decide', start: 'Paper submitted', end: 'Decided' }), hint: 'The token animation does not support complex gateways — it marks the element as unsupported.', animate: false }]
  },

  // ======================================================================= collaboration
  {
    id: 'pool',
    name: 'Pool (Participant)',
    category: 'collaboration',
    bpmnType: 'bpmn:Participant',
    icon: 'bpmn-icon-participant',
    summary: 'An independent participant, such as a company or a customer.',
    graphical: 'A large rectangle with the participant’s name in a vertical band. A collapsed (“black-box”) pool hides its internal process.',
    semantics: 'Each pool contains its own process (or none, if it is a black box). Sequence flows never cross pool borders; participants interact only by exchanging messages (message flows).',
    useCases: ['Customer, Shop and Payment provider as three pools of an online purchase.', 'A black-box pool for an external authority whose internal steps are unknown.'],
    mistakes: ['Sequence flows between pools.', 'Using pools for departments of the same company (use lanes).'],
    related: ['lane', 'message-flow', 'message-event'],
    demos: [
      {
        title: 'Two participants',
        spec: {
          pools: [
            { id: 'P_Customer', name: 'Customer', rows: [-1, -1], blackBox: true },
            { id: 'P_Shop', name: 'Shop', rows: [0, 0] }
          ],
          nodes: [
            { id: 'Start', type: 'startEvent', event: 'message', name: 'Order received', at: [0, 0] },
            { id: 'A', type: 'task', name: 'Ship order', at: [1, 0] },
            { id: 'B', type: 'sendTask', name: 'Send invoice', at: [2, 0] },
            { id: 'End', type: 'endEvent', name: 'Order completed', at: [3, 0] }
          ],
          flows: [
            { from: 'Start', to: 'A' },
            { from: 'A', to: 'B' },
            { from: 'B', to: 'End' }
          ],
          messageFlows: [
            { from: 'P_Customer', to: 'Start', name: 'order' },
            { from: 'B', to: 'P_Customer', name: 'invoice' }
          ]
        },
        hint: 'Start the shop process. Message flows connect the pools; there are no sequence flows across pool borders.',
        animate: true
      }
    ],
    lessonId: 'pools-lanes'
  },
  {
    id: 'lane',
    name: 'Lane',
    category: 'collaboration',
    bpmnType: 'bpmn:Lane',
    icon: 'bpmn-icon-lane',
    summary: 'A role or department inside one participant.',
    graphical: 'A horizontal (or vertical) partition of a pool, labeled with the role.',
    semantics: 'Lanes have no execution semantics: they show who is responsible for the elements they contain. Sequence flows may cross lane borders freely.',
    useCases: ['“Sales”, “Warehouse” and “Accounting” lanes in an order process.'],
    mistakes: ['Modeling external parties (customers, suppliers) as lanes.', 'Message flows between lanes of the same pool.'],
    related: ['pool', 'user-task'],
    demos: [
      {
        title: 'Responsibilities',
        spec: {
          pools: [
            {
              id: 'P',
              name: 'Shop',
              rows: [0, 1],
              lanes: [
                { id: 'L1', name: 'Sales', rows: [0, 0] },
                { id: 'L2', name: 'Warehouse', rows: [1, 1] }
              ]
            }
          ],
          nodes: [
            { id: 'Start', type: 'startEvent', name: 'Order received', at: [0, 0] },
            { id: 'A', type: 'task', name: 'Check order', at: [1, 0] },
            { id: 'B', type: 'task', name: 'Pack goods', at: [2, 1] },
            { id: 'C', type: 'task', name: 'Ship goods', at: [3, 1] },
            { id: 'End', type: 'endEvent', name: 'Shipped', at: [4, 1] }
          ],
          flows: [
            { from: 'Start', to: 'A' },
            { from: 'A', to: 'B' },
            { from: 'B', to: 'C' },
            { from: 'C', to: 'End' }
          ]
        },
        hint: 'The token crosses lane borders without any special behavior — lanes only show responsibility.',
        animate: true
      }
    ],
    lessonId: 'pools-lanes'
  },
  {
    id: 'sequence-flow',
    name: 'Sequence Flow',
    category: 'collaboration',
    bpmnType: 'bpmn:SequenceFlow',
    icon: 'bpmn-icon-connection',
    summary: 'Defines the order in which work happens.',
    graphical: 'A solid line with a filled arrowhead. A small diamond at the start marks a conditional flow; a slash marks the default flow.',
    semantics: 'Tokens travel along sequence flows from one flow node to the next. A conditional sequence flow is only taken when its condition is true; the default flow is taken when no other condition is true.',
    useCases: ['Connecting every step of a process.', 'Outgoing flows of a decision labeled with its outcomes.'],
    mistakes: ['Crossing pool or sub-process borders.', 'Duplicate flows between the same elements (two tokens).', 'Missing default flow when conditions may all be false.'],
    related: ['message-flow', 'exclusive-gateway'],
    demos: [{ title: 'Default flow', spec: (() => { const d = decision('exclusiveGateway', { gateway: 'Amount > 1000?', fa: 'yes', fb: 'otherwise', a: 'Ask manager', b: 'Approve directly', endA: 'Escalated', endB: 'Approved', start: 'Expense submitted' }); d.flows = d.flows.map((f) => (f.id === 'Flow_B' ? { ...f, default: true } : f.id === 'Flow_A' ? { ...f, condition: '${amount > 1000}' } : f)); return d; })(), hint: 'The slash marks the default flow, the small diamond a conditional flow.', animate: true }],
    lessonId: 'sequence-flows'
  },
  {
    id: 'message-flow',
    name: 'Message Flow',
    category: 'collaboration',
    bpmnType: 'bpmn:MessageFlow',
    icon: 'bpmn-icon-connection',
    summary: 'A message exchanged between two participants.',
    graphical: 'A dashed line with an unfilled circle at the start and an unfilled arrowhead at the end.',
    semantics: 'Message flows connect different pools. They do not move tokens of the sender’s process; they show communication that triggers or is awaited by the receiver (message start/catch events, receive tasks).',
    useCases: ['Order from customer to shop, invoice from shop to customer.'],
    mistakes: ['Message flows inside one pool.', 'Message flows ending at gateways or plain end events.'],
    related: ['pool', 'message-event', 'send-task', 'receive-task'],
    demos: [{ title: 'Order and invoice', spec: { pools: [{ id: 'P_C', name: 'Customer', rows: [-1, -1], blackBox: true }, { id: 'P_S', name: 'Shop', rows: [0, 0] }], nodes: [{ id: 'S', type: 'startEvent', event: 'message', name: 'Order received', at: [0, 0] }, { id: 'T', type: 'sendTask', name: 'Send invoice', at: [1, 0] }, { id: 'E', type: 'endEvent', name: 'Invoiced', at: [2, 0] }], flows: [{ from: 'S', to: 'T' }, { from: 'T', to: 'E' }], messageFlows: [{ from: 'P_C', to: 'S', name: 'order' }, { from: 'T', to: 'P_C', name: 'invoice' }] }, hint: 'Message flows always cross pool borders.', animate: true }],
    lessonId: 'message-flows'
  },
  {
    id: 'association',
    name: 'Association',
    category: 'collaboration',
    bpmnType: 'bpmn:Association',
    icon: 'bpmn-icon-connection',
    summary: 'Links artifacts (annotations, data) to flow elements.',
    graphical: 'A dotted line, optionally with an arrowhead (data associations show the direction of data flow).',
    semantics: 'No execution semantics for plain associations. Data associations show that an activity reads (input) or writes (output) a data object.',
    useCases: ['Attach a comment to a gateway.', 'Show that “Check invoice” reads the invoice document.'],
    mistakes: ['Using associations to express order — that is a sequence flow.'],
    related: ['text-annotation', 'data-object', 'data-store'],
    demos: [{ title: 'Annotation and data', spec: { nodes: [{ id: 'S', type: 'startEvent', name: 'Invoice received', at: [0, 0] }, { id: 'T', type: 'task', name: 'Check invoice', at: [1, 0] }, { id: 'E', type: 'endEvent', name: 'Checked', at: [2, 0] }], flows: [{ from: 'S', to: 'T' }, { from: 'T', to: 'E' }], artifacts: [{ id: 'DO', type: 'dataObject', name: 'Invoice', at: [1, 1.1] }, { id: 'Note', type: 'textAnnotation', name: 'Check amount and VAT', at: [2.2, -0.9] }], associations: [{ from: 'DO', to: 'T' }, { from: 'T', to: 'Note' }] }, hint: 'Associations carry no tokens.', animate: false }]
  },
  {
    id: 'data-object',
    name: 'Data Object',
    category: 'collaboration',
    bpmnType: 'bpmn:DataObjectReference',
    icon: 'bpmn-icon-data-object',
    summary: 'Information created or used within one process instance.',
    graphical: 'A sheet of paper with a folded corner; the state can be noted in brackets, e.g. “Invoice [checked]”.',
    semantics: 'Data objects exist only during a process instance. They do not influence the token flow in standard BPMN; data associations document which activity reads or writes them.',
    useCases: ['“Order [received]” → “Order [confirmed]”.', 'Documents passed from one task to the next.'],
    mistakes: ['Expecting data objects to trigger work — use events for that.', 'Using data objects for persistent information shared across instances (use a data store).'],
    related: ['data-store', 'association'],
    demos: [{ title: 'Document flow', spec: { nodes: [{ id: 'S', type: 'startEvent', name: 'Order received', at: [0, 0] }, { id: 'A', type: 'task', name: 'Check order', at: [1, 0] }, { id: 'B', type: 'task', name: 'Ship order', at: [2, 0] }, { id: 'E', type: 'endEvent', name: 'Shipped', at: [3, 0] }], flows: [{ from: 'S', to: 'A' }, { from: 'A', to: 'B' }, { from: 'B', to: 'E' }], artifacts: [{ id: 'DO', type: 'dataObject', name: 'Order [checked]', at: [1.5, 1.1] }], associations: [{ from: 'A', to: 'DO' }, { from: 'DO', to: 'B' }] }, hint: '“Check order” writes the data object, “Ship order” reads it.', animate: false }]
  },
  {
    id: 'data-store',
    name: 'Data Store',
    category: 'collaboration',
    bpmnType: 'bpmn:DataStoreReference',
    icon: 'bpmn-icon-data-store',
    summary: 'Persistent information that outlives a process instance.',
    graphical: 'A cylinder (database symbol).',
    semantics: 'A data store (e.g. a CRM database) can be read and updated by many instances and processes. Like data objects, it has no token semantics.',
    useCases: ['Customer database, ERP, document archive.'],
    mistakes: ['Using data stores for documents that exist only within one case.'],
    related: ['data-object', 'association'],
    demos: [{ title: 'Reading a database', spec: { nodes: [{ id: 'S', type: 'startEvent', name: 'Call received', at: [0, 0] }, { id: 'A', type: 'task', name: 'Look up customer', at: [1, 0] }, { id: 'E', type: 'endEvent', name: 'Customer identified', at: [2, 0] }], flows: [{ from: 'S', to: 'A' }, { from: 'A', to: 'E' }], artifacts: [{ id: 'DS', type: 'dataStore', name: 'CRM', at: [1, 1.1] }], associations: [{ from: 'DS', to: 'A' }] }, hint: 'Data stores document persistent data used by the process.', animate: false }]
  },
  {
    id: 'group',
    name: 'Group',
    category: 'collaboration',
    bpmnType: 'bpmn:Group',
    icon: 'bpmn-icon-group',
    summary: 'Visually groups elements of the same category.',
    graphical: 'A rounded rectangle with a dash-dot border and an optional label.',
    semantics: 'No execution semantics: groups can cross lane and pool borders and do not affect the token flow (unlike sub-processes).',
    useCases: ['Highlight all steps that belong to “Quality assurance”.', 'Mark the part of a model that is discussed in a workshop.'],
    mistakes: ['Using a group where a sub-process scope is needed (e.g. for a boundary event).'],
    related: ['subprocess', 'text-annotation'],
    demos: [{ title: 'Grouping steps', spec: { nodes: [{ id: 'S', type: 'startEvent', name: 'Goods received', at: [0, 0] }, { id: 'A', type: 'task', name: 'Inspect goods', at: [1, 0] }, { id: 'B', type: 'task', name: 'Test sample', at: [2, 0] }, { id: 'C', type: 'task', name: 'Store goods', at: [3, 0] }, { id: 'E', type: 'endEvent', name: 'Goods stored', at: [4, 0] }], flows: [{ from: 'S', to: 'A' }, { from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'E' }], artifacts: [{ id: 'G', type: 'group', name: 'Quality assurance', at: [1.5, 0], size: [300, 130] }] }, hint: 'The group has no effect on execution.', animate: true }]
  },
  {
    id: 'text-annotation',
    name: 'Text Annotation',
    category: 'collaboration',
    bpmnType: 'bpmn:TextAnnotation',
    icon: 'bpmn-icon-text-annotation',
    summary: 'A comment for the reader.',
    graphical: 'An open bracket with text, connected by an association.',
    semantics: 'No execution semantics. Annotations explain assumptions, rules or open questions.',
    useCases: ['“Approval required above € 10,000”.', 'Document a simulation assumption.'],
    mistakes: ['Hiding essential logic in annotations instead of modeling it.'],
    related: ['association', 'group'],
    demos: [{ title: 'Explaining a rule', spec: { nodes: [{ id: 'S', type: 'startEvent', name: 'Expense submitted', at: [0, 0] }, { id: 'A', type: 'task', name: 'Approve expense', at: [1, 0] }, { id: 'E', type: 'endEvent', name: 'Expense approved', at: [2, 0] }], flows: [{ from: 'S', to: 'A' }, { from: 'A', to: 'E' }], artifacts: [{ id: 'N', type: 'textAnnotation', name: 'Manager approval above € 10,000', at: [2, -1] }], associations: [{ from: 'A', to: 'N' }] }, hint: 'Annotations do not change execution.', animate: false }]
  }
];

export function getEntry(id: string): EncyclopediaEntry | undefined {
  return ENTRIES.find((e) => e.id === id);
}

const EVENT_DEF_ENTRY: Record<string, string> = {
  'bpmn:TimerEventDefinition': 'timer-event',
  'bpmn:MessageEventDefinition': 'message-event',
  'bpmn:ErrorEventDefinition': 'error-event',
  'bpmn:EscalationEventDefinition': 'escalation-event',
  'bpmn:SignalEventDefinition': 'signal-event',
  'bpmn:ConditionalEventDefinition': 'conditional-event',
  'bpmn:TerminateEventDefinition': 'terminate-end-event'
};

const TYPE_ENTRY: Record<string, string> = {
  'bpmn:StartEvent': 'start-event',
  'bpmn:EndEvent': 'end-event',
  'bpmn:IntermediateCatchEvent': 'intermediate-catch-event',
  'bpmn:IntermediateThrowEvent': 'intermediate-throw-event',
  'bpmn:BoundaryEvent': 'boundary-event',
  'bpmn:Task': 'task',
  'bpmn:UserTask': 'user-task',
  'bpmn:ServiceTask': 'service-task',
  'bpmn:ManualTask': 'manual-task',
  'bpmn:ScriptTask': 'script-task',
  'bpmn:BusinessRuleTask': 'business-rule-task',
  'bpmn:SendTask': 'send-task',
  'bpmn:ReceiveTask': 'receive-task',
  'bpmn:SubProcess': 'subprocess',
  'bpmn:Transaction': 'subprocess',
  'bpmn:AdHocSubProcess': 'subprocess',
  'bpmn:CallActivity': 'call-activity',
  'bpmn:ExclusiveGateway': 'exclusive-gateway',
  'bpmn:ParallelGateway': 'parallel-gateway',
  'bpmn:InclusiveGateway': 'inclusive-gateway',
  'bpmn:EventBasedGateway': 'event-based-gateway',
  'bpmn:ComplexGateway': 'complex-gateway',
  'bpmn:Participant': 'pool',
  'bpmn:Lane': 'lane',
  'bpmn:SequenceFlow': 'sequence-flow',
  'bpmn:MessageFlow': 'message-flow',
  'bpmn:Association': 'association',
  'bpmn:DataInputAssociation': 'association',
  'bpmn:DataOutputAssociation': 'association',
  'bpmn:DataObjectReference': 'data-object',
  'bpmn:DataStoreReference': 'data-store',
  'bpmn:Group': 'group',
  'bpmn:TextAnnotation': 'text-annotation'
};

/**
 * Encyclopedia entries describing a business object, primary entry first.
 * A timer boundary event yields [boundary-event, timer-event]; a terminate end
 * event [terminate-end-event, end-event]; a multi-instance user task
 * [user-task, multi-instance-activity].
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function entriesForBusinessObject(bo: any): string[] {
  if (!bo) return [];
  const type: string = bo.$type;
  const primary = TYPE_ENTRY[type];
  if (!primary) return [];
  const ids = [primary];
  const def = bo.eventDefinitions?.[0]?.$type;
  if (def && EVENT_DEF_ENTRY[def]) {
    if (def === 'bpmn:TerminateEventDefinition') ids.unshift('terminate-end-event');
    else ids.push(EVENT_DEF_ENTRY[def]);
  }
  const lc = bo.loopCharacteristics?.$type;
  if (lc === 'bpmn:StandardLoopCharacteristics') ids.push('loop-activity');
  if (lc === 'bpmn:MultiInstanceLoopCharacteristics') ids.push('multi-instance-activity');
  return [...new Set(ids)];
}
