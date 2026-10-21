/**
 * TokenSimulationController — drives bpmn-js-token-simulation from the BPMN
 * Studio UI and turns its trace events into an inspectable execution state:
 * active and waiting tokens, completed activities, gateway decisions, an
 * execution history, a raw event trace, step execution and blocked-state
 * detection.
 *
 * The token animation is a teaching device for execution semantics. It is
 * *not* the performance simulator: there is no time, no resources and no
 * statistics here (see features/performance-simulation for that).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Element = any;
type Scope = any;

export type SimStatus = 'off' | 'ready' | 'running' | 'paused' | 'waiting' | 'blocked' | 'completed';

export interface HistoryEntry {
  step: number;
  kind: 'start' | 'enter' | 'complete' | 'decision' | 'join' | 'end' | 'event' | 'boundary';
  elementId: string;
  label: string;
  detail?: string;
  scopeId: string;
  instanceId?: string;
}

export interface RawTraceEntry {
  step: number;
  action: string;
  elementId: string;
  elementType: string;
  scopeId?: string;
}

export interface TokenInfo {
  scopeId: string;
  elementId: string;
  elementType: string;
  label: string;
  state: 'moving' | 'waiting-join' | 'waiting-event' | 'waiting-step' | 'active';
  /** Element that produced this token (for flows), if known. */
  producerId?: string;
  instanceId?: string;
}

export interface DecisionEntry {
  step: number;
  gatewayId: string;
  gatewayLabel: string;
  flowId: string;
  flowLabel: string;
  mode: 'selected' | 'random';
}

export interface BlockedInfo {
  joins: Array<{ gatewayId: string; label: string; missingFlowIds: string[]; missingFrom: string[] }>;
}

export interface SimSnapshot {
  status: SimStatus;
  stepMode: boolean;
  randomRouting: boolean;
  speed: number;
  history: HistoryEntry[];
  raw: RawTraceEntry[];
  tokens: TokenInfo[];
  completed: Array<{ elementId: string; label: string; count: number }>;
  enabled: Array<{ elementId: string; label: string }>;
  decisions: DecisionEntry[];
  blocked: BlockedInfo | null;
  instancesStarted: number;
  instancesCompleted: number;
  unsupported: Array<{ elementId: string; label: string }>;
}

export interface TokenExplanation {
  title: string;
  why: string;
  producedBy?: string;
  path?: string;
  continuation: string;
}

const ACTIVITY_TYPES = [
  'bpmn:Task',
  'bpmn:UserTask',
  'bpmn:ServiceTask',
  'bpmn:ManualTask',
  'bpmn:ScriptTask',
  'bpmn:BusinessRuleTask',
  'bpmn:SendTask',
  'bpmn:CallActivity',
  'bpmn:SubProcess'
];

const CONTAINER_TYPES = ['bpmn:Process', 'bpmn:Participant'];

function label(el: Element): string {
  const bo = el?.businessObject;
  const name = (bo?.name ?? '').trim().replace(/\s+/g, ' ');
  if (name) return name;
  const type = (el?.type ?? '').replace('bpmn:', '').replace(/([a-z])([A-Z])/g, '$1 $2');
  return `${type} ${el?.id ?? ''}`.trim();
}

function isFlow(el: Element) {
  return el?.type === 'bpmn:SequenceFlow' || el?.type === 'bpmn:MessageFlow';
}

export class TokenSimulationController {
  private modeler: any;
  private listeners = new Set<(s: SimSnapshot) => void>();
  private snapshot: SimSnapshot;
  private stepCounter = 0;
  private lastExitByParent = new Map<string, Element>();
  private producerOf = new Map<string, string>();
  private completedCounts = new Map<string, number>();
  private quietTimer: number | undefined;
  private emitTimer: number | undefined;
  private disposers: Array<() => void> = [];
  private paused = true;

  constructor(modeler: any) {
    this.modeler = modeler;
    this.snapshot = this.emptySnapshot(false);
    const eventBus = modeler.get('eventBus');
    const on = (event: string | string[], fn: (e: any) => void, priority = 1000) => {
      eventBus.on(event, priority, fn);
      this.disposers.push(() => eventBus.off(event, fn));
    };
    on('tokenSimulation.toggleMode', (e) => this.onToggle(e.active));
    on('tokenSimulation.simulator.trace', (e) => this.onTrace(e));
    on('tokenSimulation.playSimulation', () => {
      this.paused = false;
      this.scheduleEmit();
    });
    on('tokenSimulation.pauseSimulation', () => {
      this.paused = true;
      this.scheduleEmit();
    });
    on('tokenSimulation.resetSimulation', () => this.onReset(), 500);
    on('tokenSimulation.simulator.createScope', (e) => {
      // A token on a flow is produced by the element that exited last in the same parent scope
      // (exit and creation of the outgoing flow scopes happen synchronously, one after another).
      const scope = e.scope;
      if (scope && isFlow(scope.element)) {
        const producer = this.lastExitByParent.get(scope.parent?.id ?? 'root');
        if (producer && scope.element.source === producer) this.producerOf.set(scope.id, producer.id);
        else if (scope.element.source) this.producerOf.set(scope.id, scope.element.source.id);
      }
      this.scheduleEmit();
    });
    on(['tokenSimulation.simulator.destroyScope', 'tokenSimulation.simulator.scopeChanged'], () => this.scheduleEmit());
    on('tokenSimulation.animationSpeedChanged', (e) => {
      this.snapshot = { ...this.snapshot, speed: e.speed };
      this.scheduleEmit();
    });
  }

  dispose() {
    this.disposers.forEach((d) => d());
    this.listeners.clear();
    window.clearTimeout(this.quietTimer);
    window.clearTimeout(this.emitTimer);
  }

  subscribe(fn: (s: SimSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot);
    return () => this.listeners.delete(fn);
  }

  get state(): SimSnapshot {
    return this.snapshot;
  }

  private get simulator() {
    return this.modeler.get('simulator');
  }

  private emptySnapshot(active: boolean): SimSnapshot {
    return {
      status: active ? 'ready' : 'off',
      stepMode: this.snapshot?.stepMode ?? false,
      randomRouting: this.snapshot?.randomRouting ?? false,
      speed: this.snapshot?.speed ?? 1,
      history: [],
      raw: [],
      tokens: [],
      completed: [],
      enabled: [],
      decisions: [],
      blocked: null,
      instancesStarted: 0,
      instancesCompleted: 0,
      unsupported: []
    };
  }

  // ---- commands -------------------------------------------------------------

  isActive() {
    return this.snapshot.status !== 'off';
  }

  toggle(active?: boolean) {
    this.modeler.get('toggleMode').toggleMode(active);
  }

  /** Trigger a start event (the first one by default). */
  start(startEventId?: string) {
    if (!this.isActive()) this.toggle(true);
    const registry = this.modeler.get('elementRegistry');
    const starts = registry.filter((e: Element) => e.type === 'bpmn:StartEvent' && CONTAINER_TYPES.includes(e.parent?.type));
    const start = startEventId ? registry.get(startEventId) : starts[0];
    if (!start) return false;
    const subs = this.simulator.findSubscriptions({ element: start });
    const sub = subs[0];
    if (!sub) return false;
    this.simulator.trigger({ event: sub.event, scope: sub.scope });
    return true;
  }

  playPause() {
    const pause = this.modeler.get('pauseSimulation');
    pause.toggle();
  }

  pause() {
    this.modeler.get('pauseSimulation').pause();
  }

  play() {
    this.modeler.get('pauseSimulation').unpause();
  }

  reset() {
    this.modeler.get('resetSimulation').resetSimulation();
  }

  setSpeed(speed: number) {
    this.modeler.get('animation').setAnimationSpeed(speed);
  }

  setStepMode(on: boolean) {
    const registry = this.modeler.get('elementRegistry');
    for (const el of registry.filter((e: Element) => ACTIVITY_TYPES.includes(e.type))) {
      this.simulator.waitAtElement(el, on);
    }
    this.snapshot = { ...this.snapshot, stepMode: on };
    if (!on) {
      // release everything that is currently waiting for a step
      for (const sub of this.simulator.findSubscriptions({})) {
        if (sub.event?.type === 'continue') this.simulator.trigger({ event: sub.event, scope: sub.scope });
      }
    }
    this.scheduleEmit();
  }

  /** Continue the activity that has been waiting longest. Returns false if none waits. */
  step(): boolean {
    const subs = this.simulator.findSubscriptions({}).filter((s: any) => s.event?.type === 'continue');
    const sub = subs[0];
    if (!sub) return false;
    this.play();
    this.simulator.trigger({ event: sub.event, scope: sub.scope });
    return true;
  }

  setRandomRouting(on: boolean) {
    this.snapshot = { ...this.snapshot, randomRouting: on };
    this.scheduleEmit();
  }

  /** Choose the outgoing flow an exclusive gateway takes. */
  selectRoute(gatewayId: string, flowId: string) {
    const registry = this.modeler.get('elementRegistry');
    const gateway = registry.get(gatewayId);
    const settings = this.modeler.get('exclusiveGatewaySettings', false);
    if (!gateway || !settings) return;
    const outgoing = gateway.outgoing.filter((o: Element) => o.type === 'bpmn:SequenceFlow');
    for (let i = 0; i < outgoing.length + 1; i++) {
      const active = this.simulator.getConfig(gateway).activeOutgoing;
      if (active?.id === flowId) break;
      settings.setSequenceFlow(gateway);
    }
    this.scheduleEmit();
  }

  activeRoute(gatewayId: string): string | undefined {
    const gateway = this.modeler.get('elementRegistry').get(gatewayId);
    return gateway ? this.simulator.getConfig(gateway).activeOutgoing?.id : undefined;
  }

  /** Explain why a token exists and what it needs to continue. */
  explain(scopeId: string): TokenExplanation | null {
    const scope = this.findScope(scopeId);
    if (!scope) return null;
    const el = scope.element;
    const registry = this.modeler.get('elementRegistry');
    if (isFlow(el)) {
      const source = el.source;
      const target = el.target;
      const producerId = this.producerOf.get(scope.id) ?? source?.id;
      const producer = producerId ? registry.get(producerId) : source;
      let why = '';
      if (producer?.type === 'bpmn:ExclusiveGateway') {
        why = this.snapshot.randomRouting
          ? `The exclusive gateway “${label(producer)}” chose this flow at random (random routing is on). An exclusive gateway always activates exactly one outgoing flow.`
          : `The exclusive gateway “${label(producer)}” activates exactly one outgoing flow — the one currently selected for the simulation. Click the gateway on the canvas (or use the decision list) to change the route.`;
      } else if (producer?.type === 'bpmn:ParallelGateway') {
        why = `The parallel gateway “${label(producer)}” activates every outgoing flow at once. This token is one of ${producer.outgoing.length} concurrent tokens.`;
      } else if (producer?.type === 'bpmn:InclusiveGateway') {
        why = `The inclusive gateway “${label(producer)}” activated this flow as one of the selected branches.`;
      } else if (producer?.type === 'bpmn:EventBasedGateway') {
        why = `The event-based gateway “${label(producer)}” lets the first occurring event win.`;
      } else if (producer?.type === 'bpmn:StartEvent') {
        why = `The start event “${label(producer)}” created a new process instance and placed this token on its outgoing flow.`;
      } else if (producer?.type === 'bpmn:BoundaryEvent') {
        why = `The boundary event “${label(producer)}” occurred while its activity was running and sent a token along the exception flow.`;
      } else if (producer && (producer.outgoing?.filter(isFlow).length ?? 0) > 1) {
        why = `“${label(producer)}” has ${producer.outgoing.length} outgoing flows without a gateway. BPMN treats this as an implicit parallel split: each flow receives a token.`;
      } else if (producer) {
        why = `“${label(producer)}” completed and passed its token on along its outgoing flow.`;
      }
      return {
        title: `Token on flow ${el.businessObject?.name ? `“${el.businessObject.name}”` : `${label(source)} → ${label(target)}`}`,
        why,
        producedBy: producer ? label(producer) : undefined,
        path: el.businessObject?.conditionExpression ? `Condition: ${el.businessObject.conditionExpression.body ?? '(expression)'}` : undefined,
        continuation: this.continuationText(target)
      };
    }
    const waitingJoin = el.type === 'bpmn:ParallelGateway' || el.type === 'bpmn:InclusiveGateway';
    const viaFlow = scope.initiator?.element;
    return {
      title: `Token at “${label(el)}”`,
      why: viaFlow && isFlow(viaFlow) ? `The token arrived via the flow from “${label(viaFlow.source)}”.` : 'The token is held by this element.',
      producedBy: viaFlow?.source ? label(viaFlow.source) : undefined,
      continuation: waitingJoin ? this.joinText(el) : this.continuationText(el, true)
    };
  }

  private continuationText(target: Element, atElement = false): string {
    if (!target) return '';
    const name = `“${label(target)}”`;
    const incoming = (target.incoming ?? []).filter((f: Element) => f.type === 'bpmn:SequenceFlow');
    switch (target.type) {
      case 'bpmn:ParallelGateway':
        return incoming.length > 1
          ? `${name} is a parallel join: it fires only when a token has arrived on each of its ${incoming.length} incoming flows. ${this.joinText(target)}`
          : `${name} immediately activates all its outgoing flows.`;
      case 'bpmn:ExclusiveGateway':
        return incoming.length > 1 && target.outgoing.length <= 1
          ? `${name} is an exclusive merge: every arriving token passes immediately — it does not wait for other branches.`
          : `${name} evaluates its outgoing flows and sends the token along exactly one of them.`;
      case 'bpmn:InclusiveGateway':
        return incoming.length > 1
          ? `${name} is an inclusive join: it waits for all branches that were activated and can still deliver a token.`
          : `${name} activates one or more outgoing flows whose conditions hold.`;
      case 'bpmn:EventBasedGateway':
        return `${name} waits for one of the following events; trigger one of them on the canvas.`;
      case 'bpmn:EndEvent':
        return `${name} consumes the token. The instance completes when no tokens are left.`;
      case 'bpmn:IntermediateCatchEvent':
      case 'bpmn:ReceiveTask':
        return `${name} waits until the event occurs. In the animation, trigger it with the play button on the element.`;
      default:
        if (ACTIVITY_TYPES.includes(target.type)) {
          return this.snapshot.stepMode && atElement
            ? `${name} is enabled and waits for your “Step” command (step mode).`
            : `${name} starts as soon as the token arrives. Each arriving token starts it once (an activity never waits for other tokens).`;
        }
        return `${name} passes the token on.`;
    }
  }

  private joinText(gateway: Element): string {
    const blocked = this.blockedJoins().find((b) => b.gatewayId === gateway.id);
    const waiting = this.waitingAt(gateway);
    const incoming = (gateway.incoming ?? []).filter((f: Element) => f.type === 'bpmn:SequenceFlow');
    const arrived = new Set(waiting.map((s: Scope) => s.initiator?.element?.id));
    const missing = incoming.filter((f: Element) => !arrived.has(f.id));
    if (missing.length === 0) return 'All required tokens have arrived.';
    const from = missing.map((f: Element) => `“${label(f.source)}”`).join(', ');
    return `Still missing: a token from ${from}.${blocked ? ' No such token exists anymore — the instance is blocked (deadlock).' : ''}`;
  }

  // ---- event handling ---------------------------------------------------------

  private onToggle(active: boolean) {
    this.resetTracking();
    this.snapshot = this.emptySnapshot(active);
    if (active) {
      const support = this.modeler.get('elementSupport', false);
      const unsupported = (support?.getUnsupportedElements?.() ?? []).map((e: Element) => ({ elementId: e.id, label: label(e) }));
      this.snapshot.unsupported = unsupported;
      if (this.snapshot.stepMode) window.setTimeout(() => this.setStepMode(true), 0);
    }
    this.paused = true;
    this.emit();
  }

  private onReset() {
    this.resetTracking();
    const active = this.snapshot.status !== 'off';
    this.snapshot = { ...this.emptySnapshot(active), unsupported: this.snapshot.unsupported };
    this.paused = true;
    if (this.snapshot.stepMode) window.setTimeout(() => this.setStepMode(true), 0);
    this.emit();
  }

  private resetTracking() {
    this.stepCounter = 0;
    this.lastExitByParent.clear();
    this.producerOf.clear();
    this.completedCounts.clear();
  }

  private onTrace(e: any) {
    const { action, element, scope } = e;
    if (!element) return;
    const step = ++this.stepCounter;
    const parentKey = scope?.parent?.id ?? scope?.id ?? 'root';
    const raw = this.snapshot.raw.length < 2000 ? [...this.snapshot.raw, { step, action, elementId: element.id, elementType: element.type, scopeId: scope?.id }] : this.snapshot.raw;
    let history = this.snapshot.history;
    let decisions = this.snapshot.decisions;
    const instanceId = this.instanceOf(scope)?.id;
    const push = (entry: Omit<HistoryEntry, 'step' | 'scopeId' | 'instanceId'>) => {
      if (history.length < 1000) history = [...history, { ...entry, step, scopeId: scope?.id, instanceId }];
    };
    let { instancesStarted, instancesCompleted } = this.snapshot;

    if (action === 'enter') {
      if (isFlow(element)) {
        const src = element.source;
        if (src && ['bpmn:ExclusiveGateway', 'bpmn:InclusiveGateway', 'bpmn:EventBasedGateway'].includes(src.type) && src.outgoing.length > 1) {
          decisions = [
            ...decisions,
            {
              step,
              gatewayId: src.id,
              gatewayLabel: label(src),
              flowId: element.id,
              flowLabel: element.businessObject?.name || `→ ${label(element.target)}`,
              mode: this.snapshot.randomRouting && src.type === 'bpmn:ExclusiveGateway' ? 'random' : 'selected'
            }
          ];
          push({ kind: 'decision', elementId: src.id, label: label(src), detail: element.businessObject?.name ? `“${element.businessObject.name}”` : `→ ${label(element.target)}` });
        }
      } else if (element.type === 'bpmn:ExclusiveGateway' && this.snapshot.randomRouting) {
        const outs = element.outgoing.filter((o: Element) => o.type === 'bpmn:SequenceFlow');
        if (outs.length > 1) this.selectRoute(element.id, outs[Math.floor(Math.random() * outs.length)].id);
      } else if (CONTAINER_TYPES.includes(element.type)) {
        // process instance scope
      } else if (element.type === 'bpmn:ParallelGateway' && (element.incoming?.length ?? 0) > 1) {
        push({ kind: 'join', elementId: element.id, label: label(element), detail: 'token arrived at join' });
      } else if (element.type === 'bpmn:EndEvent') {
        push({ kind: 'end', elementId: element.id, label: label(element) });
      } else if (element.type === 'bpmn:IntermediateCatchEvent' || element.type === 'bpmn:ReceiveTask') {
        push({ kind: 'event', elementId: element.id, label: label(element), detail: 'waiting for event' });
      } else if (ACTIVITY_TYPES.includes(element.type)) {
        push({ kind: 'enter', elementId: element.id, label: label(element) });
      }
    }

    if (action === 'signal' && CONTAINER_TYPES.includes(element.type)) {
      instancesStarted++;
    }

    if (action === 'exit') {
      this.lastExitByParent.set(parentKey, element);
      if (element.type === 'bpmn:StartEvent') push({ kind: 'start', elementId: element.id, label: label(element) });
      else if (element.type === 'bpmn:BoundaryEvent') push({ kind: 'boundary', elementId: element.id, label: label(element), detail: 'event occurred' });
      else if (ACTIVITY_TYPES.includes(element.type) || element.type === 'bpmn:ReceiveTask') {
        this.completedCounts.set(element.id, (this.completedCounts.get(element.id) ?? 0) + 1);
        push({ kind: 'complete', elementId: element.id, label: label(element) });
      } else if (element.type === 'bpmn:IntermediateCatchEvent') {
        push({ kind: 'event', elementId: element.id, label: label(element), detail: 'event occurred' });
      }
    }

    if (action === 'destroyScope' && CONTAINER_TYPES.includes(element.type)) {
      instancesCompleted++;
    }

    this.snapshot = { ...this.snapshot, raw, history, decisions, instancesStarted, instancesCompleted };
    this.scheduleEmit();
  }

  private instanceOf(scope: Scope): Scope | undefined {
    let s = scope;
    while (s && !CONTAINER_TYPES.includes(s.element?.type)) s = s.parent;
    return s;
  }

  private findScope(id: string): Scope | undefined {
    return this.allScopes().find((s: Scope) => s.id === id);
  }

  private allScopes(): Scope[] {
    try {
      return this.simulator.findScopes((s: Scope) => !s.destroyed);
    } catch {
      return [];
    }
  }

  private waitingAt(element: Element): Scope[] {
    return this.allScopes().filter((s: Scope) => s.element === element && s.running);
  }

  private blockedJoins(): BlockedInfo['joins'] {
    return this.snapshot.blocked?.joins ?? [];
  }

  // ---- snapshot ------------------------------------------------------------------

  private scheduleEmit() {
    window.clearTimeout(this.emitTimer);
    this.emitTimer = window.setTimeout(() => this.emit(), 40);
  }

  private computeLive() {
    const scopes = this.allScopes().filter((s: Scope) => s.running);
    const registry = this.modeler.get('elementRegistry');
    const subs = this.snapshot.status === 'off' ? [] : this.simulator.findSubscriptions({});
    const continueSubs = subs.filter((s: any) => s.event?.type === 'continue');
    const stepWaiting = new Set(continueSubs.map((s: any) => s.scope?.id));
    const eventWaiting = new Set(
      subs
        .filter((s: any) => s.element && ['bpmn:IntermediateCatchEvent', 'bpmn:ReceiveTask', 'bpmn:EventBasedGateway'].includes(s.element.type))
        .map((s: any) => s.scope?.id)
    );

    const tokens: TokenInfo[] = [];
    for (const s of scopes) {
      const el = s.element;
      if (!el || CONTAINER_TYPES.includes(el.type)) continue;
      if (el.type === 'bpmn:SubProcess' && s.children?.some((c: Scope) => !c.destroyed)) continue;
      let state: TokenInfo['state'] = 'active';
      if (isFlow(el)) state = 'moving';
      else if ((el.type === 'bpmn:ParallelGateway' || el.type === 'bpmn:InclusiveGateway') && (el.incoming?.length ?? 0) > 1) state = 'waiting-join';
      else if (stepWaiting.has(s.id)) state = 'waiting-step';
      else if (eventWaiting.has(s.id) || el.type === 'bpmn:IntermediateCatchEvent' || el.type === 'bpmn:ReceiveTask' || el.type === 'bpmn:EventBasedGateway') state = 'waiting-event';
      tokens.push({
        scopeId: s.id,
        elementId: el.id,
        elementType: el.type,
        label: isFlow(el) ? `${label(el.source)} → ${label(el.target)}` : label(el),
        state,
        producerId: this.producerOf.get(s.id),
        instanceId: this.instanceOf(s)?.id
      });
    }

    const enabled = continueSubs.map((s: any) => ({ elementId: s.element?.id ?? s.scope?.element?.id, label: label(s.element ?? s.scope?.element) }));
    const completed = [...this.completedCounts.entries()].map(([id, count]) => ({ elementId: id, label: label(registry.get(id)), count }));

    // blocked: tokens wait at joins and nothing else can move
    const joinsWaiting = tokens.filter((t) => t.state === 'waiting-join');
    const moving = tokens.filter((t) => t.state === 'moving' || t.state === 'active');
    const userCanAct = tokens.some((t) => t.state === 'waiting-event' || t.state === 'waiting-step');
    let blocked: BlockedInfo | null = null;
    if (joinsWaiting.length && moving.length === 0 && !userCanAct) {
      const byGateway = new Map<string, TokenInfo[]>();
      for (const t of joinsWaiting) byGateway.set(t.elementId, [...(byGateway.get(t.elementId) ?? []), t]);
      blocked = {
        joins: [...byGateway.keys()].map((gid) => {
          const g = registry.get(gid);
          const arrived = new Set(this.waitingAt(g).map((s: Scope) => s.initiator?.element?.id));
          const missing = (g.incoming ?? []).filter((f: Element) => f.type === 'bpmn:SequenceFlow' && !arrived.has(f.id));
          return { gatewayId: gid, label: label(g), missingFlowIds: missing.map((f: Element) => f.id), missingFrom: missing.map((f: Element) => label(f.source)) };
        })
      };
    }

    let status: SimStatus = this.snapshot.status === 'off' ? 'off' : 'ready';
    if (status !== 'off') {
      const anyInstance = this.allScopes().some((s: Scope) => s.running && CONTAINER_TYPES.includes(s.element?.type) && s.children?.some((c: Scope) => !c.destroyed));
      if (blocked) status = 'blocked';
      else if (anyInstance && userCanAct && moving.length === 0) status = 'waiting';
      else if (anyInstance) status = this.paused ? 'paused' : 'running';
      else if (this.snapshot.instancesCompleted > 0 || this.snapshot.history.length > 0) status = 'completed';
    }
    return { tokens, enabled, completed, blocked, status };
  }

  private emit() {
    if (this.snapshot.status !== 'off') {
      const live = this.computeLive();
      this.snapshot = { ...this.snapshot, ...live };
    }
    const snap = this.snapshot;
    this.listeners.forEach((l) => l(snap));
    // re-check for quiescence (blocked/completed) once animations have settled
    window.clearTimeout(this.quietTimer);
    if (snap.status === 'running') {
      this.quietTimer = window.setTimeout(() => this.emit(), 600);
    }
  }
}
