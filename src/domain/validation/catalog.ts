/**
 * Educational descriptions for every validation rule.
 * Keys are rule ids; bpmnlint rules keep their original names.
 */
import type { Evidence, LearnLink, Severity, ValidationLayer } from './types';

export interface RuleDescription {
  title: string;
  layer: ValidationLayer;
  severity: Severity;
  evidence: Evidence;
  explanation: string;
  consequence: string;
  suggestion: string;
  learnMore?: LearnLink;
}

const L = (conceptId: string, label: string): LearnLink => ({ conceptId, label });

export const RULES: Record<string, RuleDescription> = {
  // ---- structure ----------------------------------------------------------
  'xml-parse': {
    title: 'File is not valid BPMN XML',
    layer: 'structure',
    severity: 'error',
    evidence: 'rule',
    explanation: 'The document could not be read as BPMN 2.0 XML.',
    consequence: 'Nothing can be displayed, validated or simulated.',
    suggestion: 'Check that the file is a BPMN 2.0 export (namespace http://www.omg.org/spec/BPMN/20100524/MODEL) and that the XML is well-formed.'
  },
  'xml-warning': {
    title: 'Import warning',
    layer: 'structure',
    severity: 'warning',
    evidence: 'rule',
    explanation: 'The BPMN parser reported a problem while reading the file (for example an unresolved reference or an unknown element).',
    consequence: 'Parts of the model may be ignored or may not round-trip through export.',
    suggestion: 'Re-export the model from its original tool or fix the referenced element ids.'
  },
  'no-bpmndi': {
    title: 'Element has no diagram information',
    layer: 'structure',
    severity: 'error',
    evidence: 'rule',
    explanation: 'The element exists in the process but has no shape or edge in the diagram (BPMNDI).',
    consequence: 'The element is invisible in the editor although it influences execution.',
    suggestion: 'Re-create the element in the editor or remove it from the XML.'
  },
  'start-event-required': {
    title: 'Process has no start event',
    layer: 'structure',
    severity: 'error',
    evidence: 'rule',
    explanation: 'Every process should show explicitly where it begins.',
    consequence: 'Readers cannot tell what triggers the process; simulators must guess the entry point.',
    suggestion: 'Add a start event and name it after the trigger, e.g. “Order received”.',
    learnMore: L('events-basics', 'Start and end events')
  },
  'end-event-required': {
    title: 'Process has no end event',
    layer: 'structure',
    severity: 'error',
    evidence: 'rule',
    explanation: 'Every process should show explicitly how it ends.',
    consequence: 'It is unclear which outcomes the process can reach.',
    suggestion: 'Add end events for each business outcome, e.g. “Order shipped” and “Order rejected”.',
    learnMore: L('events-basics', 'Start and end events')
  },
  'no-disconnected': {
    title: 'Disconnected element',
    layer: 'structure',
    severity: 'error',
    evidence: 'rule',
    explanation: 'This element has neither incoming nor outgoing sequence flows.',
    consequence: 'It can never be executed and confuses readers of the model.',
    suggestion: 'Connect the element with sequence flows or delete it.',
    learnMore: L('sequence-flows', 'Sequence flows')
  },
  'no-duplicate-sequence-flows': {
    title: 'Duplicate sequence flows',
    layer: 'structure',
    severity: 'error',
    evidence: 'rule',
    explanation: 'Two sequence flows connect the same pair of elements.',
    consequence: 'Each flow produces its own token, so the target may be executed twice.',
    suggestion: 'Delete one of the duplicate flows.',
    learnMore: L('sequence-flows', 'Sequence flows')
  },
  'flow-across-pools': {
    title: 'Sequence flow crosses a pool boundary',
    layer: 'structure',
    severity: 'error',
    evidence: 'rule',
    explanation: 'Sequence flows may only connect elements of the same process. Communication between participants must use message flows.',
    consequence: 'The model is invalid BPMN; most tools reject or silently drop the flow.',
    suggestion: 'Replace the sequence flow by a message flow between a sending and a receiving element.',
    learnMore: L('message-flows', 'Message flows')
  },
  'flow-across-subprocess': {
    title: 'Sequence flow crosses a sub-process boundary',
    layer: 'structure',
    severity: 'error',
    evidence: 'rule',
    explanation: 'A sequence flow connects an element inside a sub-process with an element outside of it.',
    consequence: 'Invalid BPMN: tokens cannot leave or enter a sub-process except through its border.',
    suggestion: 'Connect to the sub-process itself; inside, start with a start event and finish with an end event.',
    learnMore: L('subprocesses', 'Sub-processes')
  },
  'start-with-incoming': {
    title: 'Start event has incoming flows',
    layer: 'structure',
    severity: 'error',
    evidence: 'rule',
    explanation: 'A start event marks where a new instance begins and therefore cannot have incoming sequence flows.',
    consequence: 'Invalid BPMN; execution engines reject the model.',
    suggestion: 'Redirect the incoming flow to the first activity or to a merging gateway after the start event.',
    learnMore: L('events-basics', 'Start and end events')
  },
  'end-with-outgoing': {
    title: 'End event has outgoing flows',
    layer: 'structure',
    severity: 'error',
    evidence: 'rule',
    explanation: 'An end event consumes the token; nothing can follow it.',
    consequence: 'Invalid BPMN; the outgoing path can never be executed.',
    suggestion: 'Use an intermediate event if the process continues, or move the end event to the end of the path.',
    learnMore: L('events-basics', 'Start and end events')
  },
  'boundary-without-outgoing': {
    title: 'Boundary event leads nowhere',
    layer: 'structure',
    severity: 'warning',
    evidence: 'rule',
    explanation: 'The boundary event has no outgoing sequence flow.',
    consequence: 'If it is triggered, the token disappears: for an interrupting event the activity is cancelled and the case silently ends there.',
    suggestion: 'Model the exception path that follows the event (e.g. “Notify customer”).',
    learnMore: L('boundary-events', 'Boundary events')
  },

  // ---- semantics -------------------------------------------------------------
  'message-flow-same-pool': {
    title: 'Message flow inside one pool',
    layer: 'semantics',
    severity: 'error',
    evidence: 'rule',
    explanation: 'Message flows connect different participants (pools). Inside a pool, work is passed on with sequence flows.',
    consequence: 'Invalid BPMN, and it suggests that lanes are separate organizations, which they are not.',
    suggestion: 'Use a sequence flow inside the pool, or move the external participant into its own pool.',
    learnMore: L('pools-lanes', 'Pools and lanes')
  },
  'message-flow-endpoint': {
    title: 'Invalid message flow connection',
    layer: 'semantics',
    severity: 'error',
    evidence: 'rule',
    explanation: 'Message flows must start at an element that can send (task, send task, message throw/end event, pool) and end at one that can receive (task, receive task, message start/catch/boundary event, sub-process, pool). Gateways can never send or receive messages.',
    consequence: 'Invalid BPMN; it is unclear who sends and who receives the message.',
    suggestion: 'Attach the message flow to an activity or to a message event.',
    learnMore: L('message-flows', 'Message flows')
  },
  'event-based-gateway': {
    title: 'Event-based gateway with invalid targets',
    layer: 'semantics',
    severity: 'error',
    evidence: 'rule',
    explanation: 'An event-based gateway must be followed directly by intermediate catch events or receive tasks, and needs at least two of them.',
    consequence: 'The race between events is undefined.',
    suggestion: 'Place catch events (message, timer, signal, conditional) or receive tasks directly after the gateway.',
    learnMore: L('event-based-gateway', 'Event-based gateway')
  },
  'event-sub-process-typed-start-event': {
    title: 'Event sub-process needs a typed start event',
    layer: 'semantics',
    severity: 'error',
    evidence: 'rule',
    explanation: 'An event sub-process is triggered by an event, so its start event must have a trigger (message, timer, error, …).',
    consequence: 'The event sub-process can never start.',
    suggestion: 'Give the start event an event definition.',
    learnMore: L('subprocesses', 'Sub-processes')
  },
  'fake-join': {
    title: 'Activity used as a join',
    layer: 'semantics',
    severity: 'warning',
    evidence: 'rule',
    explanation: 'Several sequence flows enter this element directly. In BPMN this is an uncontrolled merge: every incoming token starts the element again — it does not wait.',
    consequence: 'If the incoming paths run in parallel, the element is executed several times.',
    suggestion: 'Merge the flows with a gateway first: exclusive gateway for alternative paths, parallel gateway to wait for parallel branches.',
    learnMore: L('synchronization', 'Synchronization')
  },
  'no-implicit-split': {
    title: 'Implicit split',
    layer: 'semantics',
    severity: 'warning',
    evidence: 'rule',
    explanation: 'Several unconditional sequence flows leave this activity. BPMN treats this as a parallel split: all paths are taken.',
    consequence: 'Readers often expect a decision here; the model actually runs every path.',
    suggestion: 'Use an explicit parallel gateway if all paths should run, or an exclusive gateway for a decision.',
    learnMore: L('and-gateway', 'Parallel gateway')
  },
  'no-implicit-end': {
    title: 'Implicit end',
    layer: 'semantics',
    severity: 'warning',
    evidence: 'rule',
    explanation: 'The path ends at this element without an end event.',
    consequence: 'The outcome reached on this path is not visible.',
    suggestion: 'Add a named end event after the element.',
    learnMore: L('events-basics', 'Start and end events')
  },
  'no-implicit-start': {
    title: 'Implicit start',
    layer: 'semantics',
    severity: 'warning',
    evidence: 'rule',
    explanation: 'This element has no incoming flow and is not a start event.',
    consequence: 'Depending on the rest of the model it either starts on its own or is never reached.',
    suggestion: 'Connect it to the preceding element or start the path with a start event.',
    learnMore: L('process-structure', 'Basic process structure')
  },
  'single-blank-start-event': {
    title: 'Several blank start events',
    layer: 'semantics',
    severity: 'error',
    evidence: 'rule',
    explanation: 'The process has more than one start event without a trigger.',
    consequence: 'It is ambiguous where an instance begins; each start event creates its own instance.',
    suggestion: 'Keep one blank start event or give each start event a distinct trigger (message, timer, …).',
    learnMore: L('events-basics', 'Start and end events')
  },
  'single-event-definition': {
    title: 'Event with several triggers',
    layer: 'semantics',
    severity: 'error',
    evidence: 'rule',
    explanation: 'The event has more than one event definition.',
    consequence: 'Its meaning (“any of” vs. “all of”) is unclear to readers and engines.',
    suggestion: 'Split it into separate events, or use an event-based gateway.',
    learnMore: L('events-basics', 'Events')
  },
  'sub-process-blank-start-event': {
    title: 'Sub-process start event must be blank',
    layer: 'semantics',
    severity: 'error',
    evidence: 'rule',
    explanation: 'An embedded sub-process starts when a token reaches it, so its start event cannot have its own trigger.',
    consequence: 'Invalid BPMN.',
    suggestion: 'Remove the trigger from the start event inside the sub-process.',
    learnMore: L('subprocesses', 'Sub-processes')
  },
  'link-event': {
    title: 'Unmatched link event',
    layer: 'semantics',
    severity: 'error',
    evidence: 'rule',
    explanation: 'Each link throw event needs a matching link catch event with the same name in the same process.',
    consequence: 'Tokens reaching the link throw event go nowhere.',
    suggestion: 'Name the link throw and catch events identically.'
  },
  'ad-hoc-sub-process': {
    title: 'Invalid ad-hoc sub-process content',
    layer: 'semantics',
    severity: 'error',
    evidence: 'rule',
    explanation: 'Ad-hoc sub-processes must not contain start or end events.',
    consequence: 'Invalid BPMN.',
    suggestion: 'Remove start and end events from the ad-hoc sub-process.'
  },
  'gateway-outcomes-unlabeled': {
    title: 'Missing gateway conditions',
    layer: 'semantics',
    severity: 'warning',
    evidence: 'rule',
    explanation: 'Outgoing flows of a deciding gateway need a label or condition that states when each path is taken.',
    consequence: 'Nobody can tell which path a case will follow; the decision is undefined.',
    suggestion: 'Label each outgoing flow with its condition (e.g. “approved” / “rejected”) and the gateway with the question (e.g. “Credit OK?”).',
    learnMore: L('conditional-routing', 'Conditional routing')
  },
  'parallel-with-conditions': {
    title: 'Parallel gateway used like a decision',
    layer: 'semantics',
    severity: 'warning',
    evidence: 'heuristic',
    explanation: 'This parallel gateway has a question label or conditional outgoing flows (e.g. “yes/no”). A parallel gateway ignores conditions and always activates every outgoing path.',
    consequence: 'Both the “yes” and the “no” path will be executed for every case.',
    suggestion: 'If only one path should be taken, use an exclusive gateway (X). Keep the parallel gateway (+) only for work that really happens concurrently.',
    learnMore: L('and-gateway', 'XOR vs. AND')
  },
  'lane-as-participant': {
    title: 'External party modeled as a lane',
    layer: 'semantics',
    severity: 'recommendation',
    evidence: 'heuristic',
    explanation: 'A lane name suggests an external participant (e.g. a customer or supplier). Lanes partition responsibilities inside one organization; independent participants are separate pools.',
    consequence: 'Sequence flows into that lane would imply that your organization controls the external party’s work.',
    suggestion: 'Model the external party as its own pool and exchange messages with message flows.',
    learnMore: L('interorganizational', 'Interorganizational processes')
  },

  // ---- control flow ------------------------------------------------------------
  deadlock: {
    title: 'Deadlock',
    layer: 'control-flow',
    severity: 'error',
    evidence: 'formal',
    explanation: 'There is an execution in which tokens get stuck: a joining gateway waits for tokens that can never arrive.',
    consequence: 'Cases following this execution never complete.',
    suggestion: 'Close each split with a join of the same type: exclusive split → exclusive join, parallel split → parallel join.',
    learnMore: L('deadlocks', 'Deadlocks')
  },
  'lack-of-synchronization': {
    title: 'Missing synchronization (token duplication)',
    layer: 'control-flow',
    severity: 'warning',
    evidence: 'formal',
    explanation: 'Several tokens can be on the same sequence flow at the same time. This happens when parallel branches are merged without waiting for each other.',
    consequence: 'Everything after the merge is executed several times for one case (e.g. an order is shipped twice).',
    suggestion: 'Join parallel branches with a parallel gateway (+), which waits for all branches.',
    learnMore: L('synchronization', 'Synchronization')
  },
  livelock: {
    title: 'Loop without exit',
    layer: 'control-flow',
    severity: 'error',
    evidence: 'formal',
    explanation: 'Once a case enters this loop, there is no execution that ever leaves it.',
    consequence: 'Cases run forever and never reach an end event.',
    suggestion: 'Add a decision with an exit path to the loop, e.g. “Quality OK?” → yes → continue.',
    learnMore: L('loops', 'Loops')
  },
  'dead-element': {
    title: 'Unreachable element (dead path)',
    layer: 'control-flow',
    severity: 'warning',
    evidence: 'formal',
    explanation: 'No execution of the process ever reaches this element.',
    consequence: 'The modeled work never happens; this is usually a symptom of a wrong connection or a deadlock in front of it.',
    suggestion: 'Check the flows that lead to this element and the gateways in front of it.',
    learnMore: L('process-structure', 'Basic process structure')
  },
  unbounded: {
    title: 'Unbounded token growth',
    layer: 'control-flow',
    severity: 'warning',
    evidence: 'formal',
    explanation: 'Tokens accumulate without limit, typically because a loop contains a parallel split without a matching join.',
    consequence: 'Each loop iteration starts more work; the number of activity executions per case grows endlessly.',
    suggestion: 'Make sure every parallel split inside a loop is joined before the loop repeats.',
    learnMore: L('loops', 'Loops')
  },
  'gateway-mismatch': {
    title: 'Mismatched split and join',
    layer: 'control-flow',
    severity: 'warning',
    evidence: 'heuristic',
    explanation: 'The branches opened by this split are closed by a join of a different type.',
    consequence: 'Exclusive split + parallel join may deadlock; parallel split + exclusive join may duplicate work.',
    suggestion: 'Use the same gateway type for the split and its corresponding join, or verify the behavior with the token simulation.',
    learnMore: L('deadlocks', 'Gateway pairing')
  },
  'analysis-incomplete': {
    title: 'Behavioral analysis incomplete',
    layer: 'control-flow',
    severity: 'info',
    evidence: 'formal',
    explanation: 'The model has more reachable states than the analysis limit, so not all executions were checked.',
    consequence: 'Absence of control-flow findings is not guaranteed.',
    suggestion: 'Split the model into sub-processes or simplify concurrent parts to allow a complete analysis.'
  },
  'analysis-approximation': {
    title: 'Analysis uses an approximation',
    layer: 'control-flow',
    severity: 'info',
    evidence: 'formal',
    explanation: 'Some constructs (e.g. complex gateways) have no precise formal semantics in the analysis and were approximated.',
    consequence: 'Control-flow findings near these elements may be imprecise.',
    suggestion: 'Prefer exclusive, parallel and inclusive gateways.'
  },

  // ---- executability --------------------------------------------------------
  'token-unsupported': {
    title: 'Not supported by the token animation',
    layer: 'executability',
    severity: 'warning',
    evidence: 'rule',
    explanation: 'The token animation (bpmn-js-token-simulation) does not execute this element.',
    consequence: 'Tokens stop at this element during animation, although the model may be valid BPMN.',
    suggestion: 'Use exclusive, parallel or inclusive gateways if you want to animate this part.',
    learnMore: L('xor-gateway', 'Gateways')
  },
  'token-manual-trigger': {
    title: 'Requires a manual trigger in the animation',
    layer: 'executability',
    severity: 'info',
    evidence: 'rule',
    explanation: 'Catch events (messages, timers, signals, conditions), receive tasks and event-based gateways wait in the animation until you trigger them on the canvas.',
    consequence: 'The animation pauses at these elements; this is expected behavior, not a deadlock.',
    suggestion: 'Click the play button on the waiting element to trigger the event.'
  },
  'perf-blocking': {
    title: 'Performance simulation not possible',
    layer: 'executability',
    severity: 'error',
    evidence: 'rule',
    explanation: 'The discrete-event simulator does not support this construct or configuration.',
    consequence: 'Running a performance simulation is refused rather than producing misleading results.',
    suggestion: 'Adapt the model or the simulation configuration as described.'
  },
  'perf-approximation': {
    title: 'Simulated with a simplification',
    layer: 'executability',
    severity: 'info',
    evidence: 'rule',
    explanation: 'The discrete-event simulator executes this construct with a documented simplification.',
    consequence: 'KPIs reflect the simplified behavior; interpret them accordingly.',
    suggestion: 'Review the simulation assumptions before drawing conclusions.'
  },
  'perf-assumption': {
    title: 'Default simulation assumption',
    layer: 'executability',
    severity: 'info',
    evidence: 'rule',
    explanation: 'A simulation parameter was not configured; a default is used.',
    consequence: 'Results depend on the default rather than on your data.',
    suggestion: 'Configure the parameter in the simulation settings.'
  },

  // ---- pedagogy -----------------------------------------------------------------
  'label-required': {
    title: 'Missing label',
    layer: 'pedagogy',
    severity: 'recommendation',
    evidence: 'rule',
    explanation: 'This element has no name.',
    consequence: 'Readers have to guess what happens here.',
    suggestion: 'Name activities verb–object (“Check invoice”), events as states (“Invoice received”) and deciding gateways as questions (“Invoice correct?”).',
    learnMore: L('process-basics', 'Naming conventions')
  },
  'activity-naming': {
    title: 'Use verb–object activity names',
    layer: 'pedagogy',
    severity: 'recommendation',
    evidence: 'heuristic',
    explanation: 'The activity name consists of a single word.',
    consequence: 'Single nouns (“Invoice”) do not say what is done.',
    suggestion: 'Combine a verb with an object, e.g. “Check invoice”, “Approve request”.',
    learnMore: L('process-basics', 'Activities')
  },
  'no-gateway-join-fork': {
    title: 'Gateway joins and splits at once',
    layer: 'pedagogy',
    severity: 'recommendation',
    evidence: 'rule',
    explanation: 'This gateway both merges and splits the flow.',
    consequence: 'Its behavior (wait? choose? both?) is hard to read.',
    suggestion: 'Use two gateways: one to join and one to split.',
    learnMore: L('process-structure', 'Basic process structure')
  },
  'superfluous-gateway': {
    title: 'Superfluous gateway',
    layer: 'pedagogy',
    severity: 'recommendation',
    evidence: 'rule',
    explanation: 'The gateway has only one incoming and one outgoing flow.',
    consequence: 'It adds no behavior but makes the diagram longer.',
    suggestion: 'Remove the gateway and connect the elements directly.'
  },
  'superfluous-termination': {
    title: 'Superfluous terminate end event',
    layer: 'pedagogy',
    severity: 'recommendation',
    evidence: 'rule',
    explanation: 'A terminate end event is used where a normal end event would have the same effect.',
    consequence: 'Readers may look for parallel work that is being cancelled.',
    suggestion: 'Use a normal end event unless other branches must be stopped.',
    learnMore: L('events-basics', 'End events')
  },
  'superfluous-label': {
    title: 'Superfluous flow label',
    layer: 'pedagogy',
    severity: 'recommendation',
    evidence: 'rule',
    explanation: 'This sequence flow has a label although it is not the outcome of a decision.',
    consequence: 'Labels on unconditional flows suggest a condition that does not exist.',
    suggestion: 'Remove the label or move the information into a text annotation.'
  },
  'no-overlapping-elements': {
    title: 'Overlapping elements',
    layer: 'pedagogy',
    severity: 'recommendation',
    evidence: 'rule',
    explanation: 'Shapes overlap each other in the diagram.',
    consequence: 'The diagram is hard to read and elements may be hidden.',
    suggestion: 'Move the elements apart.'
  },
  'xor-without-default': {
    title: 'Consider a default flow',
    layer: 'pedagogy',
    severity: 'recommendation',
    evidence: 'rule',
    explanation: 'This exclusive gateway uses condition expressions but no default flow.',
    consequence: 'If no condition is true at runtime, the case gets stuck (in an engine: an exception).',
    suggestion: 'Mark one outgoing flow as default (the “otherwise” case).',
    learnMore: L('default-flows', 'Default flows')
  },
  'join-labeled-as-question': {
    title: 'Joining gateway labeled as a question',
    layer: 'pedagogy',
    severity: 'recommendation',
    evidence: 'heuristic',
    explanation: 'This gateway only merges flows but its label is a question.',
    consequence: 'Readers expect a decision where none is made.',
    suggestion: 'Leave merging gateways unlabeled; ask the question at the splitting gateway.',
    learnMore: L('xor-gateway', 'Exclusive gateway')
  },
  'empty-lane': {
    title: 'Empty lane',
    layer: 'pedagogy',
    severity: 'recommendation',
    evidence: 'rule',
    explanation: 'This lane contains no flow elements.',
    consequence: 'It suggests a role that does no work in the process.',
    suggestion: 'Remove the lane or move the responsible activities into it.',
    learnMore: L('pools-lanes', 'Pools and lanes')
  },
  'model-sound': {
    title: 'Control flow verified',
    layer: 'control-flow',
    severity: 'info',
    evidence: 'formal',
    explanation: 'All reachable executions were explored: every case can complete, no tokens get stuck or duplicated, and every element can be reached.',
    consequence: 'The control flow is sound for the analyzed subset of BPMN.',
    suggestion: 'Next, check the business logic with the token animation or measure performance with the simulator.',
    learnMore: L('deadlocks', 'Soundness')
  }
};

/** bpmnlint rules that are run and mapped to the descriptions above. */
export const BPMNLINT_RULES = [
  'ad-hoc-sub-process',
  'end-event-required',
  'event-based-gateway',
  'event-sub-process-typed-start-event',
  'fake-join',
  'label-required',
  'link-event',
  'no-bpmndi',
  'no-disconnected',
  'no-duplicate-sequence-flows',
  'no-gateway-join-fork',
  'no-implicit-split',
  'no-implicit-end',
  'no-implicit-start',
  'no-overlapping-elements',
  'single-blank-start-event',
  'single-event-definition',
  'start-event-required',
  'sub-process-blank-start-event',
  'superfluous-gateway',
  'superfluous-label',
  'superfluous-termination'
] as const;
