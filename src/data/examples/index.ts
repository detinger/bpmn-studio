/**
 * Example diagram library. Every example is authored with the diagram builder
 * DSL; some carry a simulation preset so they can be simulated immediately.
 */
import type { DiagramSpec } from '../../domain/bpmn/builder';
import type { Distribution } from '../../domain/simulation/distributions';
import type { ResourcePoolConfig } from '../../domain/simulation/config';

export type { SimulationPreset } from '../../domain/simulation/preset';
import type { SimulationPreset } from '../../domain/simulation/preset';

export interface ExampleDiagram {
  id: string;
  name: string;
  description: string;
  concepts: string[];
  level: 1 | 2 | 3 | 4 | 5;
  spec: DiagramSpec;
  sim?: SimulationPreset;
  /** Id of the example this one is the TO-BE alternative of. */
  toBeOf?: string;
}

const tri = (min: number, mode: number, max: number): Distribution => ({ type: 'triangular', min, mode, max });
const c = (value: number): Distribution => ({ type: 'constant', value });

const pool = (id: string, name: string, capacity: number, costPerHour: number): ResourcePoolConfig => ({
  id,
  name,
  capacity,
  costPerHour,
  calendar: null,
  discipline: 'FIFO'
});

export const EXAMPLES: ExampleDiagram[] = [
  {
    id: 'order-fulfillment',
    name: 'Order fulfillment',
    description: 'A decision followed by parallel work: valid orders are packed and invoiced at the same time, invalid orders are rejected.',
    concepts: ['xor-gateway', 'and-gateway', 'synchronization'],
    level: 2,
    spec: {
      nodes: [
        { id: 'StartEvent_Order', type: 'startEvent', name: 'Order received', at: [0, 0] },
        { id: 'Task_Check', type: 'userTask', name: 'Check order', at: [1, 0] },
        { id: 'Gateway_Valid', type: 'exclusiveGateway', name: 'Order valid?', at: [2, 0] },
        { id: 'Gateway_Split', type: 'parallelGateway', at: [3, 0] },
        { id: 'Task_Pack', type: 'manualTask', name: 'Pack goods', at: [4, -0.8] },
        { id: 'Task_Invoice', type: 'sendTask', name: 'Send invoice', at: [4, 0.8] },
        { id: 'Gateway_Join', type: 'parallelGateway', at: [5, 0] },
        { id: 'Task_Ship', type: 'userTask', name: 'Ship order', at: [6, 0] },
        { id: 'EndEvent_Done', type: 'endEvent', name: 'Order completed', at: [7, 0] },
        { id: 'Task_Notify', type: 'sendTask', name: 'Notify customer', at: [3, 2] },
        { id: 'EndEvent_Rejected', type: 'endEvent', name: 'Order rejected', at: [4, 2] }
      ],
      flows: [
        { from: 'StartEvent_Order', to: 'Task_Check' },
        { from: 'Task_Check', to: 'Gateway_Valid' },
        { id: 'Flow_Valid_Yes', from: 'Gateway_Valid', to: 'Gateway_Split', name: 'yes' },
        { id: 'Flow_Valid_No', from: 'Gateway_Valid', to: 'Task_Notify', name: 'no' },
        { from: 'Gateway_Split', to: 'Task_Pack' },
        { from: 'Gateway_Split', to: 'Task_Invoice' },
        { from: 'Task_Pack', to: 'Gateway_Join' },
        { from: 'Task_Invoice', to: 'Gateway_Join' },
        { from: 'Gateway_Join', to: 'Task_Ship' },
        { from: 'Task_Ship', to: 'EndEvent_Done' },
        { from: 'Task_Notify', to: 'EndEvent_Rejected' }
      ]
    },
    sim: {
      arrival: { kind: 'poisson', interval: 12 },
      slaMinutes: 90,
      pools: [pool('pool-clerk', 'Order clerk', 2, 35), pool('pool-warehouse', 'Warehouse staff', 3, 30)],
      activities: {
        Task_Check: { duration: tri(4, 8, 15), pool: 'pool-clerk' },
        Task_Pack: { duration: tri(10, 15, 25), pool: 'pool-warehouse' },
        Task_Invoice: { duration: c(1), fixedCost: 0.2 },
        Task_Ship: { duration: tri(5, 10, 20), pool: 'pool-warehouse', fixedCost: 4.5 },
        Task_Notify: { duration: c(1), fixedCost: 0.2 }
      },
      gateways: { Gateway_Valid: { Flow_Valid_Yes: 0.85, Flow_Valid_No: 0.15 } }
    }
  },
  {
    id: 'loan-application',
    name: 'Loan application',
    description: 'Lanes for two roles, a rework loop for incomplete applications and a non-interrupting timer that reminds the risk manager.',
    concepts: ['pools-lanes', 'loops', 'boundary-events', 'timer-events'],
    level: 4,
    spec: {
      pools: [
        {
          id: 'Participant_Bank',
          name: 'Bank',
          rows: [-1, 2],
          lanes: [
            { id: 'Lane_Officer', name: 'Loan officer', rows: [-1, 0] },
            { id: 'Lane_Risk', name: 'Risk manager', rows: [1, 2] }
          ]
        }
      ],
      nodes: [
        { id: 'StartEvent_Application', type: 'startEvent', event: 'message', name: 'Application received', at: [0, 0] },
        { id: 'Gateway_Merge', type: 'exclusiveGateway', at: [1, 0] },
        { id: 'Task_Review', type: 'userTask', name: 'Review application', at: [2, 0] },
        { id: 'Gateway_Complete', type: 'exclusiveGateway', name: 'Application complete?', at: [3, 0] },
        { id: 'Task_Request', type: 'sendTask', name: 'Request missing documents', at: [3, -1] },
        { id: 'Event_Docs', type: 'intermediateCatchEvent', event: 'message', name: 'Documents received', at: [2, -1] },
        { id: 'Task_Assess', type: 'userTask', name: 'Assess risk', at: [4, 1] },
        { id: 'Boundary_Reminder', type: 'boundaryEvent', event: 'timer', timer: 'P2D', interrupting: false, name: '2 days', attachedTo: 'Task_Assess' },
        { id: 'Task_Remind', type: 'sendTask', name: 'Remind risk manager', at: [5, 2] },
        { id: 'EndEvent_Reminded', type: 'endEvent', name: 'Reminder sent', at: [6, 2] },
        { id: 'Gateway_Risk', type: 'exclusiveGateway', name: 'Risk acceptable?', at: [5, 1] },
        { id: 'Task_Offer', type: 'sendTask', name: 'Send loan offer', at: [6, 0] },
        { id: 'EndEvent_Offer', type: 'endEvent', name: 'Offer sent', at: [7, 0] },
        { id: 'Task_Reject', type: 'sendTask', name: 'Send rejection', at: [6, 1] },
        { id: 'EndEvent_Rejected', type: 'endEvent', name: 'Application rejected', at: [7, 1] }
      ],
      flows: [
        { from: 'StartEvent_Application', to: 'Gateway_Merge' },
        { from: 'Gateway_Merge', to: 'Task_Review' },
        { from: 'Task_Review', to: 'Gateway_Complete' },
        { id: 'Flow_Complete_No', from: 'Gateway_Complete', to: 'Task_Request', name: 'no' },
        { from: 'Task_Request', to: 'Event_Docs', waypoints: [[560, -10], [478, -10]] },
        { from: 'Event_Docs', to: 'Gateway_Merge', waypoints: [[442, -10], [310, -10], [310, 85]] },
        { id: 'Flow_Complete_Yes', from: 'Gateway_Complete', to: 'Task_Assess', name: 'yes' },
        { from: 'Task_Assess', to: 'Gateway_Risk' },
        { from: 'Boundary_Reminder', to: 'Task_Remind' },
        { from: 'Task_Remind', to: 'EndEvent_Reminded' },
        { id: 'Flow_Risk_Yes', from: 'Gateway_Risk', to: 'Task_Offer', name: 'yes' },
        { from: 'Task_Offer', to: 'EndEvent_Offer' },
        { id: 'Flow_Risk_No', from: 'Gateway_Risk', to: 'Task_Reject', name: 'no' },
        { from: 'Task_Reject', to: 'EndEvent_Rejected' }
      ]
    },
    sim: {
      arrival: { kind: 'poisson', interval: 45 },
      slaMinutes: 8 * 60,
      pools: [pool('pool-officer', 'Loan officer', 2, 45), pool('pool-risk', 'Risk manager', 1, 70)],
      activities: {
        Task_Review: { duration: tri(15, 25, 45), pool: 'pool-officer' },
        Task_Request: { duration: c(2) },
        Task_Assess: { duration: tri(20, 35, 60), pool: 'pool-risk' },
        Task_Remind: { duration: c(1) },
        Task_Offer: { duration: c(3) },
        Task_Reject: { duration: c(3) }
      },
      gateways: {
        Gateway_Complete: { Flow_Complete_Yes: 0.8, Flow_Complete_No: 0.2 },
        Gateway_Risk: { Flow_Risk_Yes: 0.7, Flow_Risk_No: 0.3 }
      },
      events: { Event_Docs: { delay: tri(60, 240, 1440) } }
    }
  },
  {
    id: 'insurance-claim',
    name: 'Insurance claim (collaboration)',
    description: 'Two participants: the customer (black-box pool) exchanges messages with the insurer, whose pool is divided into two lanes.',
    concepts: ['pools-lanes', 'message-flows', 'interorganizational'],
    level: 4,
    spec: {
      pools: [
        { id: 'Participant_Customer', name: 'Customer', rows: [-1, -1], blackBox: true },
        {
          id: 'Participant_Insurer',
          name: 'Insurance company',
          rows: [0, 1],
          lanes: [
            { id: 'Lane_Claims', name: 'Claims department', rows: [0, 0] },
            { id: 'Lane_Finance', name: 'Finance', rows: [1, 1] }
          ]
        }
      ],
      nodes: [
        { id: 'StartEvent_Claim', type: 'startEvent', event: 'message', name: 'Claim received', at: [0, 0] },
        { id: 'Task_Register', type: 'userTask', name: 'Register claim', at: [1, 0] },
        { id: 'Task_Assess', type: 'userTask', name: 'Assess claim', at: [2, 0] },
        { id: 'Gateway_Covered', type: 'exclusiveGateway', name: 'Claim covered?', at: [3, 0] },
        { id: 'Task_Reject', type: 'sendTask', name: 'Send rejection', at: [4, 0] },
        { id: 'EndEvent_Rejected', type: 'endEvent', name: 'Claim rejected', at: [5, 0] },
        { id: 'Task_Approve', type: 'userTask', name: 'Approve payment', at: [4, 1] },
        { id: 'Task_Pay', type: 'serviceTask', name: 'Transfer payment', at: [5, 1] },
        { id: 'Task_Confirm', type: 'sendTask', name: 'Send payment confirmation', at: [6, 1] },
        { id: 'EndEvent_Paid', type: 'endEvent', name: 'Claim settled', at: [7, 1] }
      ],
      flows: [
        { from: 'StartEvent_Claim', to: 'Task_Register' },
        { from: 'Task_Register', to: 'Task_Assess' },
        { from: 'Task_Assess', to: 'Gateway_Covered' },
        { id: 'Flow_Covered_No', from: 'Gateway_Covered', to: 'Task_Reject', name: 'no' },
        { from: 'Task_Reject', to: 'EndEvent_Rejected' },
        { id: 'Flow_Covered_Yes', from: 'Gateway_Covered', to: 'Task_Approve', name: 'yes' },
        { from: 'Task_Approve', to: 'Task_Pay' },
        { from: 'Task_Pay', to: 'Task_Confirm' },
        { from: 'Task_Confirm', to: 'EndEvent_Paid' }
      ],
      messageFlows: [
        { id: 'MessageFlow_Claim', from: 'Participant_Customer', to: 'StartEvent_Claim', name: 'claim form' },
        { id: 'MessageFlow_Rejection', from: 'Task_Reject', to: 'Participant_Customer', name: 'rejection letter' },
        { id: 'MessageFlow_Confirmation', from: 'Task_Confirm', to: 'Participant_Customer', name: 'confirmation' }
      ]
    },
    sim: {
      arrival: { kind: 'poisson', interval: 20 },
      slaMinutes: 180,
      pools: [pool('pool-claims', 'Claims handler', 3, 40), pool('pool-finance', 'Finance officer', 1, 55)],
      activities: {
        Task_Register: { duration: tri(5, 8, 12), pool: 'pool-claims' },
        Task_Assess: { duration: tri(15, 25, 40), pool: 'pool-claims' },
        Task_Reject: { duration: c(2) },
        Task_Approve: { duration: tri(5, 10, 15), pool: 'pool-finance' },
        Task_Pay: { duration: c(1), fixedCost: 0.5 },
        Task_Confirm: { duration: c(1) }
      },
      gateways: { Gateway_Covered: { Flow_Covered_Yes: 0.75, Flow_Covered_No: 0.25 } }
    }
  },
  {
    id: 'hospital-admission',
    name: 'Hospital admission (inclusive gateway)',
    description: 'An inclusive gateway activates one or both diagnostic tests; the inclusive join waits for exactly the tests that were started.',
    concepts: ['or-gateway', 'synchronization'],
    level: 3,
    spec: {
      nodes: [
        { id: 'StartEvent_Arrival', type: 'startEvent', name: 'Patient arrived', at: [0, 0] },
        { id: 'Task_Triage', type: 'userTask', name: 'Triage patient', at: [1, 0] },
        { id: 'Gateway_Tests', type: 'inclusiveGateway', name: 'Which tests?', at: [2, 0] },
        { id: 'Task_Blood', type: 'manualTask', name: 'Take blood sample', at: [3, -0.8] },
        { id: 'Task_Xray', type: 'manualTask', name: 'Take X-ray', at: [3, 0.8] },
        { id: 'Gateway_Results', type: 'inclusiveGateway', at: [4, 0] },
        { id: 'Task_Diagnose', type: 'userTask', name: 'Diagnose patient', at: [5, 0] },
        { id: 'EndEvent_Diagnosed', type: 'endEvent', name: 'Patient diagnosed', at: [6, 0] }
      ],
      flows: [
        { from: 'StartEvent_Arrival', to: 'Task_Triage' },
        { from: 'Task_Triage', to: 'Gateway_Tests' },
        { id: 'Flow_Blood', from: 'Gateway_Tests', to: 'Task_Blood', name: 'blood test needed' },
        { id: 'Flow_Xray', from: 'Gateway_Tests', to: 'Task_Xray', name: 'X-ray needed' },
        { from: 'Task_Blood', to: 'Gateway_Results' },
        { from: 'Task_Xray', to: 'Gateway_Results' },
        { from: 'Gateway_Results', to: 'Task_Diagnose' },
        { from: 'Task_Diagnose', to: 'EndEvent_Diagnosed' }
      ]
    },
    sim: {
      arrival: { kind: 'poisson', interval: 15 },
      slaMinutes: 120,
      pools: [pool('pool-nurse', 'Nurse', 2, 38), pool('pool-radiology', 'Radiographer', 1, 50), pool('pool-doctor', 'Doctor', 2, 90)],
      activities: {
        Task_Triage: { duration: tri(5, 8, 12), pool: 'pool-nurse' },
        Task_Blood: { duration: tri(5, 10, 15), pool: 'pool-nurse' },
        Task_Xray: { duration: tri(10, 15, 25), pool: 'pool-radiology' },
        Task_Diagnose: { duration: tri(10, 15, 30), pool: 'pool-doctor' }
      },
      gateways: { Gateway_Tests: { Flow_Blood: 0.6, Flow_Xray: 0.5 } }
    }
  },
  {
    id: 'support-escalation',
    name: 'Support ticket with escalation',
    description: 'A non-interrupting timer boundary event escalates slow tickets while the work continues.',
    concepts: ['boundary-events', 'timer-events', 'escalations'],
    level: 5,
    spec: {
      nodes: [
        { id: 'StartEvent_Ticket', type: 'startEvent', name: 'Ticket submitted', at: [0, 0] },
        { id: 'Task_Classify', type: 'businessRuleTask', name: 'Classify ticket', at: [1, 0] },
        { id: 'Task_Resolve', type: 'userTask', name: 'Resolve issue', at: [2, 0] },
        { id: 'Boundary_Sla', type: 'boundaryEvent', event: 'timer', timer: 'PT4H', interrupting: false, name: '4 hours', attachedTo: 'Task_Resolve' },
        { id: 'Task_Escalate', type: 'userTask', name: 'Inform team lead', at: [3, 1] },
        { id: 'EndEvent_Escalated', type: 'endEvent', event: 'escalation', name: 'Ticket escalated', at: [4, 1] },
        { id: 'Task_Close', type: 'userTask', name: 'Close ticket', at: [3, 0] },
        { id: 'EndEvent_Closed', type: 'endEvent', name: 'Ticket closed', at: [4, 0] }
      ],
      flows: [
        { from: 'StartEvent_Ticket', to: 'Task_Classify' },
        { from: 'Task_Classify', to: 'Task_Resolve' },
        { from: 'Boundary_Sla', to: 'Task_Escalate' },
        { from: 'Task_Escalate', to: 'EndEvent_Escalated' },
        { from: 'Task_Resolve', to: 'Task_Close' },
        { from: 'Task_Close', to: 'EndEvent_Closed' }
      ]
    },
    sim: {
      arrival: { kind: 'poisson', interval: 30 },
      slaMinutes: 240,
      pools: [pool('pool-agent', 'Support agent', 2, 32), pool('pool-lead', 'Team lead', 1, 60)],
      activities: {
        Task_Classify: { duration: c(1) },
        Task_Resolve: { duration: { type: 'lognormal', mean: 90, sd: 80 }, pool: 'pool-agent' },
        Task_Escalate: { duration: tri(5, 10, 20), pool: 'pool-lead' },
        Task_Close: { duration: tri(2, 4, 8), pool: 'pool-agent' }
      }
    }
  },
  {
    id: 'purchase-approval',
    name: 'Purchase approval (rework loop)',
    description: 'Rejected purchase orders are revised and reviewed again — tokens revisit activities.',
    concepts: ['loops', 'xor-gateway'],
    level: 3,
    spec: {
      nodes: [
        { id: 'StartEvent_Request', type: 'startEvent', name: 'Purchase needed', at: [0, 0] },
        { id: 'Gateway_Merge', type: 'exclusiveGateway', at: [1, 0] },
        { id: 'Task_Prepare', type: 'userTask', name: 'Prepare purchase order', at: [2, 0] },
        { id: 'Task_Review', type: 'userTask', name: 'Review purchase order', at: [3, 0] },
        { id: 'Gateway_Approved', type: 'exclusiveGateway', name: 'Approved?', at: [4, 0] },
        { id: 'Task_Send', type: 'sendTask', name: 'Send order to supplier', at: [5, 0] },
        { id: 'EndEvent_Ordered', type: 'endEvent', name: 'Goods ordered', at: [6, 0] }
      ],
      flows: [
        { from: 'StartEvent_Request', to: 'Gateway_Merge' },
        { from: 'Gateway_Merge', to: 'Task_Prepare' },
        { from: 'Task_Prepare', to: 'Task_Review' },
        { from: 'Task_Review', to: 'Gateway_Approved' },
        { id: 'Flow_Approved_Yes', from: 'Gateway_Approved', to: 'Task_Send', name: 'yes' },
        { id: 'Flow_Approved_No', from: 'Gateway_Approved', to: 'Gateway_Merge', name: 'needs changes', route: 'below' },
        { from: 'Task_Send', to: 'EndEvent_Ordered' }
      ]
    },
    sim: {
      arrival: { kind: 'poisson', interval: 40 },
      slaMinutes: 180,
      pools: [pool('pool-employee', 'Employee', 3, 30), pool('pool-manager', 'Manager', 1, 75)],
      activities: {
        Task_Prepare: { duration: tri(10, 20, 30), pool: 'pool-employee' },
        Task_Review: { duration: tri(5, 10, 20), pool: 'pool-manager' },
        Task_Send: { duration: c(2) }
      },
      gateways: { Gateway_Approved: { Flow_Approved_Yes: 0.7, Flow_Approved_No: 0.3 } }
    }
  },
  {
    id: 'travel-booking',
    name: 'Travel booking (event-based gateway)',
    description: 'After requesting a booking, the process waits for whichever happens first: the confirmation message or a 24-hour timeout.',
    concepts: ['event-based-gateway', 'timer-events'],
    level: 3,
    spec: {
      nodes: [
        { id: 'StartEvent_Trip', type: 'startEvent', name: 'Trip requested', at: [0, 0] },
        { id: 'Task_Request', type: 'sendTask', name: 'Request booking', at: [1, 0] },
        { id: 'Gateway_Wait', type: 'eventBasedGateway', at: [2, 0] },
        { id: 'Event_Confirmed', type: 'intermediateCatchEvent', event: 'message', name: 'Confirmation received', at: [3, -0.8] },
        { id: 'Event_Timeout', type: 'intermediateCatchEvent', event: 'timer', timer: 'PT24H', name: '24 hours', at: [3, 0.8] },
        { id: 'Task_Ticket', type: 'serviceTask', name: 'Issue tickets', at: [4, -0.8] },
        { id: 'EndEvent_Booked', type: 'endEvent', name: 'Trip booked', at: [5, -0.8] },
        { id: 'Task_Cancel', type: 'userTask', name: 'Cancel request', at: [4, 0.8] },
        { id: 'EndEvent_Cancelled', type: 'endEvent', name: 'Booking cancelled', at: [5, 0.8] }
      ],
      flows: [
        { from: 'StartEvent_Trip', to: 'Task_Request' },
        { from: 'Task_Request', to: 'Gateway_Wait' },
        { id: 'Flow_Confirmed', from: 'Gateway_Wait', to: 'Event_Confirmed' },
        { id: 'Flow_Timeout', from: 'Gateway_Wait', to: 'Event_Timeout' },
        { from: 'Event_Confirmed', to: 'Task_Ticket' },
        { from: 'Task_Ticket', to: 'EndEvent_Booked' },
        { from: 'Event_Timeout', to: 'Task_Cancel' },
        { from: 'Task_Cancel', to: 'EndEvent_Cancelled' }
      ]
    },
    sim: {
      arrival: { kind: 'poisson', interval: 60 },
      slaMinutes: 24 * 60,
      pools: [pool('pool-agent', 'Travel agent', 1, 35)],
      activities: {
        Task_Request: { duration: c(5) },
        Task_Ticket: { duration: c(1) },
        Task_Cancel: { duration: tri(5, 8, 12), pool: 'pool-agent' }
      },
      events: { Event_Confirmed: { delay: { type: 'lognormal', mean: 600, sd: 500 } } }
    }
  },
  {
    id: 'payment-error-handling',
    name: 'Payment with error handling',
    description: 'An embedded sub-process throws an error end event; the error boundary event on the sub-process redirects the order to cancellation.',
    concepts: ['subprocesses', 'error-handling', 'boundary-events'],
    level: 5,
    spec: {
      nodes: [
        { id: 'StartEvent_Order', type: 'startEvent', name: 'Order placed', at: [0, 0] },
        { id: 'SubProcess_Payment', type: 'subProcess', name: 'Process payment', at: [2, 0] },
        { id: 'StartEvent_Pay', type: 'startEvent', at: [1, 0], parent: 'SubProcess_Payment' },
        { id: 'Task_Charge', type: 'serviceTask', name: 'Charge credit card', at: [2, 0], parent: 'SubProcess_Payment' },
        { id: 'Gateway_PayOk', type: 'exclusiveGateway', name: 'Payment successful?', at: [3, 0], parent: 'SubProcess_Payment' },
        { id: 'EndEvent_Paid', type: 'endEvent', name: 'Paid', at: [4, 0], parent: 'SubProcess_Payment' },
        { id: 'EndEvent_PayFailed', type: 'endEvent', event: 'error', name: 'Payment failed', at: [4, 1], parent: 'SubProcess_Payment' },
        { id: 'Boundary_PaymentError', type: 'boundaryEvent', event: 'error', name: 'Payment failed', attachedTo: 'SubProcess_Payment', boundaryOffset: 0.85 },
        { id: 'Task_Ship', type: 'userTask', name: 'Ship order', at: [5.5, 0] },
        { id: 'EndEvent_Shipped', type: 'endEvent', name: 'Order shipped', at: [6.5, 0] },
        { id: 'Task_Cancel', type: 'sendTask', name: 'Notify customer', at: [5.5, 2.4] },
        { id: 'EndEvent_Cancelled', type: 'endEvent', name: 'Order cancelled', at: [6.5, 2.4] }
      ],
      flows: [
        { from: 'StartEvent_Order', to: 'SubProcess_Payment', waypoints: [[178, 110], [256, 110]] },
        { from: 'StartEvent_Pay', to: 'Task_Charge' },
        { from: 'Task_Charge', to: 'Gateway_PayOk' },
        { id: 'Flow_Pay_Yes', from: 'Gateway_PayOk', to: 'EndEvent_Paid', name: 'yes' },
        { id: 'Flow_Pay_No', from: 'Gateway_PayOk', to: 'EndEvent_PayFailed', name: 'no' },
        { from: 'SubProcess_Payment', to: 'Task_Ship', waypoints: [[814, 110], [935, 110]] },
        { from: 'Task_Ship', to: 'EndEvent_Shipped' },
        { from: 'Boundary_PaymentError', to: 'Task_Cancel' },
        { from: 'Task_Cancel', to: 'EndEvent_Cancelled' }
      ]
    },
    sim: {
      arrival: { kind: 'poisson', interval: 10 },
      slaMinutes: 60,
      pools: [pool('pool-warehouse', 'Warehouse staff', 2, 30)],
      activities: {
        Task_Charge: { duration: c(1), fixedCost: 0.3 },
        Task_Ship: { duration: tri(8, 12, 20), pool: 'pool-warehouse' },
        Task_Cancel: { duration: c(1) }
      },
      gateways: { Gateway_PayOk: { Flow_Pay_Yes: 0.92, Flow_Pay_No: 0.08 } }
    }
  },
  {
    id: 'claims-as-is',
    name: 'Claims handling — AS-IS',
    description: 'A strictly sequential claims process with a congested assessment step and a manager approval for every claim. Use it as the baseline of a redesign experiment.',
    concepts: ['process-structure'],
    level: 1,
    spec: {
      nodes: [
        { id: 'StartEvent_Claim', type: 'startEvent', name: 'Claim received', at: [0, 0] },
        { id: 'Task_Register', type: 'userTask', name: 'Register claim', at: [1, 0] },
        { id: 'Task_Coverage', type: 'userTask', name: 'Check coverage', at: [2, 0] },
        { id: 'Task_Assess', type: 'userTask', name: 'Assess damage', at: [3, 0] },
        { id: 'Task_Approve', type: 'userTask', name: 'Approve settlement', at: [4, 0] },
        { id: 'Task_Pay', type: 'serviceTask', name: 'Pay settlement', at: [5, 0] },
        { id: 'EndEvent_Settled', type: 'endEvent', name: 'Claim settled', at: [6, 0] }
      ],
      flows: [
        { from: 'StartEvent_Claim', to: 'Task_Register' },
        { from: 'Task_Register', to: 'Task_Coverage' },
        { from: 'Task_Coverage', to: 'Task_Assess' },
        { from: 'Task_Assess', to: 'Task_Approve' },
        { from: 'Task_Approve', to: 'Task_Pay' },
        { from: 'Task_Pay', to: 'EndEvent_Settled' }
      ]
    },
    sim: {
      arrival: { kind: 'poisson', interval: 10 },
      numberOfCases: 400,
      replications: 10,
      slaMinutes: 120,
      waitingCostPerHour: 6,
      pools: [pool('pool-clerk', 'Clerk', 2, 32), pool('pool-assessor', 'Assessor', 2, 48), pool('pool-manager', 'Manager', 1, 80)],
      activities: {
        Task_Register: { duration: tri(3, 5, 8), pool: 'pool-clerk' },
        Task_Coverage: { duration: tri(4, 6, 10), pool: 'pool-clerk' },
        Task_Assess: { duration: tri(10, 15, 25), pool: 'pool-assessor' },
        Task_Approve: { duration: tri(5, 7, 10), pool: 'pool-manager' },
        Task_Pay: { duration: c(1), fixedCost: 0.5 }
      }
    }
  },
  {
    id: 'claims-to-be',
    name: 'Claims handling — TO-BE (suggested)',
    description: 'A redesign: coverage is checked automatically in parallel with the damage assessment, and only high-value claims need a manager approval.',
    concepts: ['and-gateway', 'xor-gateway'],
    level: 2,
    toBeOf: 'claims-as-is',
    spec: {
      nodes: [
        { id: 'StartEvent_Claim', type: 'startEvent', name: 'Claim received', at: [0, 0] },
        { id: 'Task_Register', type: 'userTask', name: 'Register claim', at: [1, 0] },
        { id: 'Gateway_Split', type: 'parallelGateway', at: [2, 0] },
        { id: 'Task_Coverage', type: 'serviceTask', name: 'Check coverage', at: [3, -0.8] },
        { id: 'Task_Assess', type: 'userTask', name: 'Assess damage', at: [3, 0.8] },
        { id: 'Gateway_Join', type: 'parallelGateway', at: [4, 0] },
        { id: 'Gateway_Value', type: 'exclusiveGateway', name: 'High-value claim?', at: [5, 0] },
        { id: 'Task_Approve', type: 'userTask', name: 'Approve settlement', at: [6, -0.8] },
        { id: 'Gateway_Merge', type: 'exclusiveGateway', at: [7, 0] },
        { id: 'Task_Pay', type: 'serviceTask', name: 'Pay settlement', at: [8, 0] },
        { id: 'EndEvent_Settled', type: 'endEvent', name: 'Claim settled', at: [9, 0] }
      ],
      flows: [
        { from: 'StartEvent_Claim', to: 'Task_Register' },
        { from: 'Task_Register', to: 'Gateway_Split' },
        { from: 'Gateway_Split', to: 'Task_Coverage' },
        { from: 'Gateway_Split', to: 'Task_Assess' },
        { from: 'Task_Coverage', to: 'Gateway_Join' },
        { from: 'Task_Assess', to: 'Gateway_Join' },
        { from: 'Gateway_Join', to: 'Gateway_Value' },
        { id: 'Flow_Value_Yes', from: 'Gateway_Value', to: 'Task_Approve', name: 'yes' },
        { id: 'Flow_Value_No', from: 'Gateway_Value', to: 'Gateway_Merge', name: 'no', default: true },
        { from: 'Task_Approve', to: 'Gateway_Merge' },
        { from: 'Gateway_Merge', to: 'Task_Pay' },
        { from: 'Task_Pay', to: 'EndEvent_Settled' }
      ]
    },
    sim: {
      arrival: { kind: 'poisson', interval: 10 },
      numberOfCases: 400,
      replications: 10,
      slaMinutes: 120,
      waitingCostPerHour: 6,
      pools: [pool('pool-clerk', 'Clerk', 2, 32), pool('pool-assessor', 'Assessor', 2, 48), pool('pool-manager', 'Manager', 1, 80)],
      activities: {
        Task_Register: { duration: tri(3, 5, 8), pool: 'pool-clerk' },
        Task_Coverage: { duration: c(1), fixedCost: 0.2 },
        Task_Assess: { duration: tri(10, 15, 25), pool: 'pool-assessor' },
        Task_Approve: { duration: tri(5, 7, 10), pool: 'pool-manager' },
        Task_Pay: { duration: c(1), fixedCost: 0.5 }
      },
      gateways: { Gateway_Value: { Flow_Value_Yes: 0.3, Flow_Value_No: 0.7 } }
    }
  }
];

export function getExample(id: string): ExampleDiagram | undefined {
  return EXAMPLES.find((e) => e.id === id);
}
