/**
 * ProcessGraph — a simplified, serializable view of a BPMN 2.0 model.
 *
 * The graph is derived from the bpmn-moddle object tree (either parsed from
 * XML or taken from a live bpmn-js modeler). Validation, behavioral analysis,
 * challenge assessment and the discrete-event simulation all operate on this
 * structure instead of on the editor, which keeps those engines testable in
 * plain Node and usable inside Web Workers.
 */

export type EventDefinitionKind =
  | 'none'
  | 'message'
  | 'timer'
  | 'error'
  | 'escalation'
  | 'signal'
  | 'conditional'
  | 'terminate'
  | 'link'
  | 'compensate'
  | 'cancel'
  | 'multiple';

export type NodeKind =
  | 'start'
  | 'end'
  | 'activity'
  | 'subProcess'
  | 'gateway'
  | 'intermediateCatch'
  | 'intermediateThrow'
  | 'boundary';

export type GatewayKind = 'exclusive' | 'parallel' | 'inclusive' | 'eventBased' | 'complex';

export type LoopKind = 'standard' | 'parallel' | 'sequential';

export interface GraphNode {
  id: string;
  name: string;
  /** Full BPMN type, e.g. `bpmn:UserTask`. */
  type: string;
  kind: NodeKind;
  gateway?: GatewayKind;
  eventDefinition?: EventDefinitionKind;
  /** Link name, or id of the referenced message/signal/error/escalation. */
  eventRef?: string;
  /** Incoming sequence flow ids. */
  incoming: string[];
  /** Outgoing sequence flow ids. */
  outgoing: string[];
  messageIncoming: string[];
  messageOutgoing: string[];
  /** Id of the containing process or sub-process. */
  scopeId: string;
  /** Host activity of a boundary event. */
  attachedTo?: string;
  /** Interrupting boundary event / event sub-process start event. */
  interrupting?: boolean;
  boundaryEvents: string[];
  defaultFlow?: string;
  loop?: LoopKind;
  loopCardinality?: number;
  triggeredByEvent?: boolean;
  isForCompensation?: boolean;
  /** Timer definition text (ISO 8601 duration/date/cycle) if present. */
  timerExpression?: string;
  laneIds: string[];
  participantId?: string;
}

export interface GraphFlow {
  id: string;
  name: string;
  sourceId: string;
  targetId: string;
  scopeId: string;
  condition?: string;
  isDefault: boolean;
}

export interface GraphMessageFlow {
  id: string;
  name: string;
  sourceId: string;
  targetId: string;
}

export type ScopeKind = 'process' | 'subProcess' | 'eventSubProcess' | 'transaction' | 'adHocSubProcess';

export interface GraphScope {
  id: string;
  name: string;
  kind: ScopeKind;
  parentScopeId?: string;
  nodeIds: string[];
  flowIds: string[];
  participantId?: string;
}

export interface GraphParticipant {
  id: string;
  name: string;
  processId?: string;
}

export interface GraphLane {
  id: string;
  name: string;
  processId: string;
  nodeIds: string[];
}

export interface GraphArtifact {
  id: string;
  type: string;
  name: string;
  scopeId?: string;
}

export interface ProcessGraph {
  nodes: Record<string, GraphNode>;
  flows: Record<string, GraphFlow>;
  messageFlows: Record<string, GraphMessageFlow>;
  scopes: Record<string, GraphScope>;
  participants: GraphParticipant[];
  lanes: GraphLane[];
  artifacts: GraphArtifact[];
  /** Top-level processes (one per participant in a collaboration). */
  rootScopeIds: string[];
  isCollaboration: boolean;
  /** Element ids that appear more than once or references that could not be resolved. */
  problems: string[];
}

// moddle elements are untyped JS objects; we access them defensively.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ModdleElement = any;

const EVENT_DEFINITION_MAP: Record<string, EventDefinitionKind> = {
  'bpmn:MessageEventDefinition': 'message',
  'bpmn:TimerEventDefinition': 'timer',
  'bpmn:ErrorEventDefinition': 'error',
  'bpmn:EscalationEventDefinition': 'escalation',
  'bpmn:SignalEventDefinition': 'signal',
  'bpmn:ConditionalEventDefinition': 'conditional',
  'bpmn:TerminateEventDefinition': 'terminate',
  'bpmn:LinkEventDefinition': 'link',
  'bpmn:CompensateEventDefinition': 'compensate',
  'bpmn:CancelEventDefinition': 'cancel'
};

const GATEWAY_MAP: Record<string, GatewayKind> = {
  'bpmn:ExclusiveGateway': 'exclusive',
  'bpmn:ParallelGateway': 'parallel',
  'bpmn:InclusiveGateway': 'inclusive',
  'bpmn:EventBasedGateway': 'eventBased',
  'bpmn:ComplexGateway': 'complex'
};

const SUBPROCESS_TYPES = new Set(['bpmn:SubProcess', 'bpmn:Transaction', 'bpmn:AdHocSubProcess']);

export function isActivityType(type: string): boolean {
  return (
    type.endsWith('Task') ||
    type === 'bpmn:CallActivity' ||
    SUBPROCESS_TYPES.has(type)
  );
}

function kindOf(type: string): NodeKind | null {
  if (type === 'bpmn:StartEvent') return 'start';
  if (type === 'bpmn:EndEvent') return 'end';
  if (type === 'bpmn:IntermediateCatchEvent') return 'intermediateCatch';
  if (type === 'bpmn:IntermediateThrowEvent') return 'intermediateThrow';
  if (type === 'bpmn:BoundaryEvent') return 'boundary';
  if (GATEWAY_MAP[type]) return 'gateway';
  if (SUBPROCESS_TYPES.has(type)) return 'subProcess';
  if (isActivityType(type)) return 'activity';
  return null;
}

function eventDefinitionOf(el: ModdleElement): { kind: EventDefinitionKind; ref?: string; timer?: string } {
  const defs: ModdleElement[] = el.eventDefinitions || [];
  if (defs.length === 0) return { kind: 'none' };
  if (defs.length > 1) return { kind: 'multiple' };
  const def = defs[0];
  const kind = EVENT_DEFINITION_MAP[def.$type] ?? 'none';
  let ref: string | undefined;
  if (kind === 'link') ref = def.name;
  else if (def.messageRef) ref = def.messageRef.id;
  else if (def.signalRef) ref = def.signalRef.id;
  else if (def.errorRef) ref = def.errorRef.id;
  else if (def.escalationRef) ref = def.escalationRef.id;
  let timer: string | undefined;
  if (kind === 'timer') {
    timer = def.timeDuration?.body ?? def.timeDate?.body ?? def.timeCycle?.body;
  }
  return { kind, ref, timer };
}

function loopOf(el: ModdleElement): { loop?: LoopKind; cardinality?: number } {
  const lc = el.loopCharacteristics;
  if (!lc) return {};
  if (lc.$type === 'bpmn:StandardLoopCharacteristics') return { loop: 'standard' };
  if (lc.$type === 'bpmn:MultiInstanceLoopCharacteristics') {
    const raw = lc.loopCardinality?.body;
    const n = raw !== undefined ? Number.parseInt(String(raw), 10) : Number.NaN;
    return {
      loop: lc.isSequential ? 'sequential' : 'parallel',
      cardinality: Number.isFinite(n) && n > 0 ? n : undefined
    };
  }
  return {};
}

function scopeKindOf(el: ModdleElement): ScopeKind {
  if (el.$type === 'bpmn:Transaction') return 'transaction';
  if (el.$type === 'bpmn:AdHocSubProcess') return 'adHocSubProcess';
  if (el.triggeredByEvent) return 'eventSubProcess';
  return 'subProcess';
}

/**
 * Build a ProcessGraph from a bpmn-moddle `bpmn:Definitions` element.
 */
export function buildProcessGraph(definitions: ModdleElement): ProcessGraph {
  const graph: ProcessGraph = {
    nodes: {},
    flows: {},
    messageFlows: {},
    scopes: {},
    participants: [],
    lanes: [],
    artifacts: [],
    rootScopeIds: [],
    isCollaboration: false,
    problems: []
  };

  const rootElements: ModdleElement[] = definitions?.rootElements ?? [];
  const processToParticipant = new Map<string, string>();

  for (const root of rootElements) {
    if (root.$type === 'bpmn:Collaboration') {
      graph.isCollaboration = true;
      for (const p of root.participants ?? []) {
        graph.participants.push({ id: p.id, name: p.name ?? '', processId: p.processRef?.id });
        if (p.processRef?.id) processToParticipant.set(p.processRef.id, p.id);
      }
      for (const mf of root.messageFlows ?? []) {
        graph.messageFlows[mf.id] = {
          id: mf.id,
          name: mf.name ?? '',
          sourceId: mf.sourceRef?.id,
          targetId: mf.targetRef?.id
        };
      }
      for (const a of root.artifacts ?? []) {
        graph.artifacts.push({ id: a.id, type: a.$type, name: a.name ?? a.text ?? '' });
      }
    }
  }

  const visitScope = (container: ModdleElement, scopeId: string, participantId?: string) => {
    const scope = graph.scopes[scopeId];
    for (const el of container.flowElements ?? []) {
      const type: string = el.$type;
      if (type === 'bpmn:SequenceFlow') {
        if (graph.flows[el.id]) graph.problems.push(el.id);
        graph.flows[el.id] = {
          id: el.id,
          name: el.name ?? '',
          sourceId: el.sourceRef?.id,
          targetId: el.targetRef?.id,
          scopeId,
          condition: el.conditionExpression ? String(el.conditionExpression.body ?? '').trim() || '(expression)' : undefined,
          isDefault: false
        };
        scope.flowIds.push(el.id);
        continue;
      }
      const kind = kindOf(type);
      if (!kind) {
        if (type === 'bpmn:DataObjectReference' || type === 'bpmn:DataStoreReference' || type === 'bpmn:DataObject') {
          if (type !== 'bpmn:DataObject') {
            graph.artifacts.push({ id: el.id, type, name: el.name ?? '', scopeId });
          }
        }
        continue;
      }
      if (graph.nodes[el.id]) graph.problems.push(el.id);
      const ev = kind === 'start' || kind === 'end' || kind === 'boundary' || kind === 'intermediateCatch' || kind === 'intermediateThrow'
        ? eventDefinitionOf(el)
        : undefined;
      const loop = loopOf(el);
      const node: GraphNode = {
        id: el.id,
        name: el.name ?? '',
        type,
        kind,
        gateway: GATEWAY_MAP[type],
        eventDefinition: ev?.kind,
        eventRef: ev?.ref,
        timerExpression: ev?.timer,
        incoming: [],
        outgoing: [],
        messageIncoming: [],
        messageOutgoing: [],
        scopeId,
        attachedTo: kind === 'boundary' ? el.attachedToRef?.id : undefined,
        interrupting: kind === 'boundary' ? el.cancelActivity !== false : kind === 'start' ? el.isInterrupting !== false : undefined,
        boundaryEvents: [],
        defaultFlow: el.default?.id,
        loop: loop.loop,
        loopCardinality: loop.cardinality,
        triggeredByEvent: SUBPROCESS_TYPES.has(type) ? Boolean(el.triggeredByEvent) : undefined,
        isForCompensation: el.isForCompensation ? true : undefined,
        laneIds: [],
        participantId
      };
      graph.nodes[el.id] = node;
      scope.nodeIds.push(el.id);

      if (kind === 'subProcess') {
        graph.scopes[el.id] = {
          id: el.id,
          name: el.name ?? '',
          kind: scopeKindOf(el),
          parentScopeId: scopeId,
          nodeIds: [],
          flowIds: [],
          participantId
        };
        visitScope(el, el.id, participantId);
      }
    }
    for (const a of container.artifacts ?? []) {
      graph.artifacts.push({ id: a.id, type: a.$type, name: a.name ?? a.text ?? '', scopeId });
    }
  };

  const visitLanes = (laneSets: ModdleElement[] | undefined, processId: string) => {
    for (const ls of laneSets ?? []) {
      for (const lane of ls.lanes ?? []) {
        const nodeIds = (lane.flowNodeRef ?? []).map((n: ModdleElement) => n.id);
        graph.lanes.push({ id: lane.id, name: lane.name ?? '', processId, nodeIds });
        if (lane.childLaneSet) visitLanes([lane.childLaneSet], processId);
      }
    }
  };

  for (const root of rootElements) {
    if (root.$type !== 'bpmn:Process') continue;
    const participantId = processToParticipant.get(root.id);
    graph.scopes[root.id] = {
      id: root.id,
      name: root.name ?? '',
      kind: 'process',
      nodeIds: [],
      flowIds: [],
      participantId
    };
    graph.rootScopeIds.push(root.id);
    visitScope(root, root.id, participantId);
    visitLanes(root.laneSets, root.id);
  }

  // Wire flows into nodes.
  for (const flow of Object.values(graph.flows)) {
    const source = graph.nodes[flow.sourceId];
    const target = graph.nodes[flow.targetId];
    if (source) source.outgoing.push(flow.id);
    else graph.problems.push(flow.id);
    if (target) target.incoming.push(flow.id);
    else graph.problems.push(flow.id);
    if (source?.defaultFlow === flow.id) flow.isDefault = true;
  }
  for (const mf of Object.values(graph.messageFlows)) {
    graph.nodes[mf.sourceId]?.messageOutgoing.push(mf.id);
    graph.nodes[mf.targetId]?.messageIncoming.push(mf.id);
  }
  for (const node of Object.values(graph.nodes)) {
    if (node.attachedTo) graph.nodes[node.attachedTo]?.boundaryEvents.push(node.id);
  }
  for (const lane of graph.lanes) {
    for (const id of lane.nodeIds) graph.nodes[id]?.laneIds.push(lane.id);
  }

  return graph;
}

// ---------------------------------------------------------------------------
// Convenience queries

export function nodesOfScope(graph: ProcessGraph, scopeId: string): GraphNode[] {
  return (graph.scopes[scopeId]?.nodeIds ?? []).map((id) => graph.nodes[id]).filter(Boolean);
}

export function displayName(graph: ProcessGraph, id: string): string {
  const el = graph.nodes[id] ?? graph.flows[id] ?? graph.messageFlows[id];
  if (!el) return id;
  if (el.name && el.name.trim()) return el.name.trim().replace(/\s+/g, ' ');
  if ('kind' in el) return `${typeLabel(el.type)} (${id})`;
  return `Flow ${id}`;
}

const TYPE_LABELS: Record<string, string> = {
  'bpmn:StartEvent': 'Start Event',
  'bpmn:EndEvent': 'End Event',
  'bpmn:IntermediateCatchEvent': 'Intermediate Catch Event',
  'bpmn:IntermediateThrowEvent': 'Intermediate Throw Event',
  'bpmn:BoundaryEvent': 'Boundary Event',
  'bpmn:Task': 'Task',
  'bpmn:UserTask': 'User Task',
  'bpmn:ServiceTask': 'Service Task',
  'bpmn:ManualTask': 'Manual Task',
  'bpmn:ScriptTask': 'Script Task',
  'bpmn:BusinessRuleTask': 'Business Rule Task',
  'bpmn:SendTask': 'Send Task',
  'bpmn:ReceiveTask': 'Receive Task',
  'bpmn:SubProcess': 'Sub-Process',
  'bpmn:Transaction': 'Transaction',
  'bpmn:AdHocSubProcess': 'Ad-hoc Sub-Process',
  'bpmn:CallActivity': 'Call Activity',
  'bpmn:ExclusiveGateway': 'Exclusive Gateway',
  'bpmn:ParallelGateway': 'Parallel Gateway',
  'bpmn:InclusiveGateway': 'Inclusive Gateway',
  'bpmn:EventBasedGateway': 'Event-based Gateway',
  'bpmn:ComplexGateway': 'Complex Gateway',
  'bpmn:SequenceFlow': 'Sequence Flow',
  'bpmn:MessageFlow': 'Message Flow',
  'bpmn:Association': 'Association',
  'bpmn:DataObjectReference': 'Data Object',
  'bpmn:DataStoreReference': 'Data Store',
  'bpmn:TextAnnotation': 'Text Annotation',
  'bpmn:Group': 'Group',
  'bpmn:Participant': 'Pool',
  'bpmn:Lane': 'Lane',
  'bpmn:Process': 'Process',
  'bpmn:Collaboration': 'Collaboration'
};

export function typeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type.replace(/^bpmn:/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** Ids of every node reachable from `fromNodeId` following sequence flows (excluding the start). */
export function forwardReachable(graph: ProcessGraph, fromNodeIds: string[], stopAt?: Set<string>): Set<string> {
  const seen = new Set<string>();
  const stack = [...fromNodeIds];
  while (stack.length) {
    const id = stack.pop()!;
    const node = graph.nodes[id];
    if (!node) continue;
    const next = [...node.outgoing.map((f) => graph.flows[f]?.targetId), ...node.boundaryEvents];
    for (const t of next) {
      if (!t || seen.has(t)) continue;
      seen.add(t);
      if (stopAt?.has(t)) continue;
      stack.push(t);
    }
  }
  return seen;
}
