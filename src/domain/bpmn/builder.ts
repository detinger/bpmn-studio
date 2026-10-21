/**
 * Diagram builder — a compact grid-based DSL that produces standards-compliant
 * BPMN 2.0 XML including diagram interchange (BPMNDI).
 *
 * Teaching content (examples, lessons, challenges, encyclopedia demos) is
 * authored with this DSL so that every bundled diagram is generated from a
 * single, reviewable source and has deterministic, stable element ids.
 */

export type BuilderElementType =
  | 'startEvent'
  | 'endEvent'
  | 'intermediateCatchEvent'
  | 'intermediateThrowEvent'
  | 'boundaryEvent'
  | 'task'
  | 'userTask'
  | 'serviceTask'
  | 'manualTask'
  | 'scriptTask'
  | 'businessRuleTask'
  | 'sendTask'
  | 'receiveTask'
  | 'subProcess'
  | 'callActivity'
  | 'exclusiveGateway'
  | 'parallelGateway'
  | 'inclusiveGateway'
  | 'eventBasedGateway'
  | 'complexGateway';

export type BuilderEventType =
  | 'message'
  | 'timer'
  | 'error'
  | 'escalation'
  | 'signal'
  | 'conditional'
  | 'terminate'
  | 'link'
  | 'compensate';

export interface NodeSpec {
  id: string;
  type: BuilderElementType;
  name?: string;
  /** Grid position [column, row] of the element center. Fractions are allowed. Not needed for boundary events. */
  at?: [number, number];
  event?: BuilderEventType;
  /** ISO-8601 duration for timer events, e.g. `PT2H`. */
  timer?: string;
  linkName?: string;
  /** Host activity for boundary events. */
  attachedTo?: string;
  /** Relative position of a boundary event along the bottom edge of its host (0..1). */
  boundaryOffset?: number;
  interrupting?: boolean;
  loop?: 'standard' | 'parallel' | 'sequential';
  loopCardinality?: number;
  /** Containing (expanded) sub-process. */
  parent?: string;
  triggeredByEvent?: boolean;
  /** Compensation handler activity. */
  isForCompensation?: boolean;
  /** Explicit width/height in px. */
  size?: [number, number];
}

export interface FlowSpec {
  id?: string;
  from: string;
  to: string;
  name?: string;
  condition?: string;
  default?: boolean;
  /** Absolute waypoints in px. Overrides automatic routing. */
  waypoints?: [number, number][];
  route?: 'auto' | 'below' | 'above';
}

export interface LaneSpec {
  id: string;
  name: string;
  rows: [number, number];
}

export interface PoolSpec {
  id: string;
  name: string;
  /** Inclusive row range covered by the pool. */
  rows: [number, number];
  processId?: string;
  lanes?: LaneSpec[];
  /** A black-box pool has no process content. */
  blackBox?: boolean;
}

export interface MessageFlowSpec {
  id?: string;
  from: string;
  to: string;
  name?: string;
}

export interface ArtifactSpec {
  id: string;
  type: 'dataObject' | 'dataStore' | 'textAnnotation' | 'group';
  at: [number, number];
  name?: string;
  size?: [number, number];
}

export interface AssociationSpec {
  id?: string;
  from: string;
  to: string;
}

export interface DiagramSpec {
  id?: string;
  name?: string;
  nodes: NodeSpec[];
  flows: FlowSpec[];
  pools?: PoolSpec[];
  messageFlows?: MessageFlowSpec[];
  artifacts?: ArtifactSpec[];
  associations?: AssociationSpec[];
}

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const GRID = {
  col: 150,
  row: 120,
  x0: 160,
  y0: 110
};

const TAG: Record<BuilderElementType, string> = {
  startEvent: 'bpmn:startEvent',
  endEvent: 'bpmn:endEvent',
  intermediateCatchEvent: 'bpmn:intermediateCatchEvent',
  intermediateThrowEvent: 'bpmn:intermediateThrowEvent',
  boundaryEvent: 'bpmn:boundaryEvent',
  task: 'bpmn:task',
  userTask: 'bpmn:userTask',
  serviceTask: 'bpmn:serviceTask',
  manualTask: 'bpmn:manualTask',
  scriptTask: 'bpmn:scriptTask',
  businessRuleTask: 'bpmn:businessRuleTask',
  sendTask: 'bpmn:sendTask',
  receiveTask: 'bpmn:receiveTask',
  subProcess: 'bpmn:subProcess',
  callActivity: 'bpmn:callActivity',
  exclusiveGateway: 'bpmn:exclusiveGateway',
  parallelGateway: 'bpmn:parallelGateway',
  inclusiveGateway: 'bpmn:inclusiveGateway',
  eventBasedGateway: 'bpmn:eventBasedGateway',
  complexGateway: 'bpmn:complexGateway'
};

const EVENT_DEF_TAG: Record<BuilderEventType, string> = {
  message: 'bpmn:messageEventDefinition',
  timer: 'bpmn:timerEventDefinition',
  error: 'bpmn:errorEventDefinition',
  escalation: 'bpmn:escalationEventDefinition',
  signal: 'bpmn:signalEventDefinition',
  conditional: 'bpmn:conditionalEventDefinition',
  terminate: 'bpmn:terminateEventDefinition',
  link: 'bpmn:linkEventDefinition',
  compensate: 'bpmn:compensateEventDefinition'
};

function isEvent(t: BuilderElementType) {
  return t.endsWith('Event');
}
function isGateway(t: BuilderElementType) {
  return t.endsWith('Gateway');
}
function isActivity(t: BuilderElementType) {
  return !isEvent(t) && !isGateway(t);
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function attr(name: string, value: string | number | boolean | undefined): string {
  if (value === undefined || value === '') return '';
  return ` ${name}="${escapeXml(String(value))}"`;
}

function center(at: [number, number]): [number, number] {
  return [GRID.x0 + at[0] * GRID.col, GRID.y0 + at[1] * GRID.row];
}

function defaultSize(t: BuilderElementType): [number, number] {
  if (isEvent(t)) return [36, 36];
  if (isGateway(t)) return [50, 50];
  return [100, 80];
}

function round(n: number) {
  return Math.round(n);
}

/** Build BPMN 2.0 XML (with DI) from a DiagramSpec. */
export function buildBpmnXml(input: DiagramSpec): string {
  // Boundary events live in the same container as their host.
  const hostParent = new Map(input.nodes.map((n) => [n.id, n.parent]));
  const spec: DiagramSpec = {
    ...input,
    nodes: input.nodes.map((n) =>
      n.type === 'boundaryEvent' && !n.parent && n.attachedTo && hostParent.get(n.attachedTo)
        ? { ...n, parent: hostParent.get(n.attachedTo) }
        : n
    )
  };
  const nodes = new Map(spec.nodes.map((n) => [n.id, n]));
  const children = new Map<string, NodeSpec[]>();
  for (const n of spec.nodes) {
    if (n.parent) {
      if (!nodes.has(n.parent)) throw new Error(`Unknown parent ${n.parent} for ${n.id}`);
      const list = children.get(n.parent) ?? [];
      list.push(n);
      children.set(n.parent, list);
    }
  }

  // ---- geometry --------------------------------------------------------
  const bounds = new Map<string, Bounds>();

  const plainBounds = (n: NodeSpec): Bounds => {
    if (!n.at) throw new Error(`Node ${n.id} needs a grid position`);
    const [cx, cy] = center(n.at);
    const [w, h] = n.size ?? defaultSize(n.type);
    return { x: round(cx - w / 2), y: round(cy - h / 2), w, h };
  };

  // non-boundary, non-expanded nodes first
  const expandedIds = new Set(children.keys());
  for (const n of spec.nodes) {
    if (n.type === 'boundaryEvent' || expandedIds.has(n.id)) continue;
    bounds.set(n.id, plainBounds(n));
  }
  // expanded sub-processes: bounding box of children (deepest first)
  const depth = (n: NodeSpec): number => (n.parent ? 1 + depth(nodes.get(n.parent)!) : 0);
  const expandedSorted = [...expandedIds].map((id) => nodes.get(id)!).sort((a, b) => depth(b) - depth(a));
  for (const sp of expandedSorted) {
    const kids = children.get(sp.id)!.filter((k) => k.type !== 'boundaryEvent');
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const k of kids) {
      const b = bounds.get(k.id)!;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    const pad = 36;
    bounds.set(sp.id, { x: minX - pad, y: minY - pad - 8, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad + 8 });
  }
  // boundary events
  const boundaryCount = new Map<string, number>();
  for (const n of spec.nodes) {
    if (n.type !== 'boundaryEvent') continue;
    if (!n.attachedTo || !bounds.has(n.attachedTo)) throw new Error(`Boundary event ${n.id} needs a valid attachedTo`);
    const host = bounds.get(n.attachedTo)!;
    const idx = boundaryCount.get(n.attachedTo) ?? 0;
    boundaryCount.set(n.attachedTo, idx + 1);
    const f = n.boundaryOffset ?? (idx === 0 ? 0.7 : idx === 1 ? 0.3 : 0.5);
    const cx = host.x + host.w * f;
    const cy = host.y + host.h;
    bounds.set(n.id, { x: round(cx - 18), y: round(cy - 18), w: 36, h: 36 });
  }

  const artifactBounds = new Map<string, Bounds>();
  for (const a of spec.artifacts ?? []) {
    const [cx, cy] = center(a.at);
    const size: [number, number] =
      a.size ?? (a.type === 'dataObject' ? [36, 50] : a.type === 'dataStore' ? [50, 50] : a.type === 'textAnnotation' ? [140, 50] : [300, 200]);
    artifactBounds.set(a.id, { x: round(cx - size[0] / 2), y: round(cy - size[1] / 2), w: size[0], h: size[1] });
  }

  // ---- pools / processes -----------------------------------------------
  const pools = spec.pools ?? [];
  const isCollab = pools.length > 0;
  const processOfNode = new Map<string, string>();
  const poolOfProcess = new Map<string, PoolSpec>();
  const rootOf = (n: NodeSpec): NodeSpec => (n.parent ? rootOf(nodes.get(n.parent)!) : n);

  if (isCollab) {
    for (const p of pools) {
      if (!p.blackBox) poolOfProcess.set(p.processId ?? `Process_${p.id}`, p);
    }
    for (const n of spec.nodes) {
      const root = rootOf(n.type === 'boundaryEvent' ? nodes.get(n.attachedTo!)! : n);
      const row = root.at![1];
      const pool = pools.find((p) => !p.blackBox && row >= p.rows[0] - 0.5 && row <= p.rows[1] + 0.5);
      if (!pool) throw new Error(`Node ${n.id} is not inside any pool`);
      processOfNode.set(n.id, pool.processId ?? `Process_${pool.id}`);
    }
  } else {
    for (const n of spec.nodes) processOfNode.set(n.id, 'Process_1');
  }

  const allCols = spec.nodes.filter((n) => n.at).map((n) => n.at![0]);
  const minCol = Math.min(...allCols, 0);
  const maxCol = Math.max(...allCols, 1);
  const poolBounds = new Map<string, Bounds>();
  const laneBounds = new Map<string, Bounds>();
  for (const p of pools) {
    const x = round(GRID.x0 + minCol * GRID.col - GRID.col / 2 - 30);
    const w = round((maxCol - minCol + 1) * GRID.col + 30);
    let y = round(GRID.y0 + p.rows[0] * GRID.row - GRID.row / 2);
    let h = round((p.rows[1] - p.rows[0] + 1) * GRID.row);
    if (p.blackBox) {
      y = round(GRID.y0 + p.rows[0] * GRID.row - 35);
      h = 70;
    }
    poolBounds.set(p.id, { x, y, w, h });
    for (const l of p.lanes ?? []) {
      const ly = round(GRID.y0 + l.rows[0] * GRID.row - GRID.row / 2);
      const lh = round((l.rows[1] - l.rows[0] + 1) * GRID.row);
      laneBounds.set(l.id, { x: x + 30, y: ly, w: w - 30, h: lh });
    }
  }

  // ---- flows -------------------------------------------------------------
  const usedIds = new Set<string>(spec.nodes.map((n) => n.id));
  const flowIds: string[] = [];
  for (const f of spec.flows) {
    let id = f.id ?? `Flow_${f.from}_${f.to}`;
    let i = 2;
    while (usedIds.has(id)) id = `${f.id ?? `Flow_${f.from}_${f.to}`}_${i++}`;
    usedIds.add(id);
    flowIds.push(id);
    if (!nodes.has(f.from) || !nodes.has(f.to)) throw new Error(`Flow ${id} references unknown node`);
  }
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  spec.flows.forEach((f, i) => {
    outgoing.set(f.from, [...(outgoing.get(f.from) ?? []), flowIds[i]]);
    incoming.set(f.to, [...(incoming.get(f.to) ?? []), flowIds[i]]);
  });
  const defaultOf = new Map<string, string>();
  spec.flows.forEach((f, i) => {
    if (f.default) defaultOf.set(f.from, flowIds[i]);
  });

  const route = (f: FlowSpec): [number, number][] => {
    if (f.waypoints) return f.waypoints;
    const s = bounds.get(f.from)!;
    const t = bounds.get(f.to)!;
    const sNode = nodes.get(f.from)!;
    const tNode = nodes.get(f.to)!;
    const sc: [number, number] = [s.x + s.w / 2, s.y + s.h / 2];
    const tc: [number, number] = [t.x + t.w / 2, t.y + t.h / 2];
    const sameRow = Math.abs(sc[1] - tc[1]) < 2;
    const forward = tc[0] > sc[0] + 2;
    if (sNode.type === 'boundaryEvent') {
      if (forward && !sameRow && tc[1] > sc[1]) return [[sc[0], s.y + s.h], [sc[0], tc[1]], [t.x, tc[1]]];
      if (!forward) {
        const yLoop = Math.max(s.y + s.h, t.y + t.h) + 30;
        return [[sc[0], s.y + s.h], [sc[0], yLoop], [tc[0], yLoop], [tc[0], t.y + t.h]];
      }
      return [[sc[0], s.y + s.h], [sc[0], tc[1]], [t.x, tc[1]]];
    }
    if (f.route === 'below' || f.route === 'above' || !forward) {
      if (Math.abs(tc[0] - sc[0]) < 2 && !sameRow && f.route === undefined) {
        return tc[1] > sc[1] ? [[sc[0], s.y + s.h], [tc[0], t.y]] : [[sc[0], s.y], [tc[0], t.y + t.h]];
      }
      const above = f.route === 'above';
      const yLoop = above ? Math.min(s.y, t.y) - 40 : Math.max(s.y + s.h, t.y + t.h) + 40;
      const sy = above ? s.y : s.y + s.h;
      const ty = above ? t.y : t.y + t.h;
      return [[sc[0], sy], [sc[0], yLoop], [tc[0], yLoop], [tc[0], ty]];
    }
    if (sameRow) return [[s.x + s.w, sc[1]], [t.x, tc[1]]];
    const down = tc[1] > sc[1];
    if (isGateway(sNode.type)) {
      return [[sc[0], down ? s.y + s.h : s.y], [sc[0], tc[1]], [t.x, tc[1]]];
    }
    if (isGateway(tNode.type)) {
      return [[s.x + s.w, sc[1]], [tc[0], sc[1]], [tc[0], down ? t.y : t.y + t.h]];
    }
    const midX = round((s.x + s.w + t.x) / 2);
    return [[s.x + s.w, sc[1]], [midX, sc[1]], [midX, tc[1]], [t.x, tc[1]]];
  };

  // ---- XML: process content ----------------------------------------------
  const ind = (lvl: number) => '  '.repeat(lvl);
  const nodeXml = (n: NodeSpec, lvl: number): string => {
    const tag = TAG[n.type];
    const expanded = expandedIds.has(n.id);
    let a = attr('id', n.id) + attr('name', n.name);
    if (n.type === 'boundaryEvent') {
      a += attr('cancelActivity', n.interrupting === false ? 'false' : undefined) + attr('attachedToRef', n.attachedTo);
    }
    if (n.type === 'startEvent' && n.interrupting === false) a += attr('isInterrupting', 'false');
    if (n.type === 'subProcess' && n.triggeredByEvent) a += attr('triggeredByEvent', 'true');
    if (n.isForCompensation) a += attr('isForCompensation', 'true');
    if (defaultOf.has(n.id)) a += attr('default', defaultOf.get(n.id));
    const inner: string[] = [];
    for (const fid of incoming.get(n.id) ?? []) inner.push(`${ind(lvl + 1)}<bpmn:incoming>${fid}</bpmn:incoming>`);
    for (const fid of outgoing.get(n.id) ?? []) inner.push(`${ind(lvl + 1)}<bpmn:outgoing>${fid}</bpmn:outgoing>`);
    if (isActivity(n.type)) {
      const assocIn = (spec.associations ?? []).filter((as) => as.to === n.id && isDataArtifact(as.from));
      const assocOut = (spec.associations ?? []).filter((as) => as.from === n.id && isDataArtifact(as.to));
      if (assocIn.length) inner.push(`${ind(lvl + 1)}<bpmn:property id="Property_${n.id}" name="__targetRef_placeholder" />`);
      for (const as of assocIn) {
        inner.push(`${ind(lvl + 1)}<bpmn:dataInputAssociation id="${assocId(as)}">`);
        inner.push(`${ind(lvl + 2)}<bpmn:sourceRef>${as.from}</bpmn:sourceRef>`);
        inner.push(`${ind(lvl + 2)}<bpmn:targetRef>Property_${n.id}</bpmn:targetRef>`);
        inner.push(`${ind(lvl + 1)}</bpmn:dataInputAssociation>`);
      }
      for (const as of assocOut) {
        inner.push(`${ind(lvl + 1)}<bpmn:dataOutputAssociation id="${assocId(as)}">`);
        inner.push(`${ind(lvl + 2)}<bpmn:targetRef>${as.to}</bpmn:targetRef>`);
        inner.push(`${ind(lvl + 1)}</bpmn:dataOutputAssociation>`);
      }
      if (n.loop === 'standard') inner.push(`${ind(lvl + 1)}<bpmn:standardLoopCharacteristics />`);
      if (n.loop === 'parallel' || n.loop === 'sequential') {
        const seq = n.loop === 'sequential' ? ' isSequential="true"' : '';
        if (n.loopCardinality) {
          inner.push(`${ind(lvl + 1)}<bpmn:multiInstanceLoopCharacteristics${seq}>`);
          inner.push(`${ind(lvl + 2)}<bpmn:loopCardinality xsi:type="bpmn:tFormalExpression">${n.loopCardinality}</bpmn:loopCardinality>`);
          inner.push(`${ind(lvl + 1)}</bpmn:multiInstanceLoopCharacteristics>`);
        } else {
          inner.push(`${ind(lvl + 1)}<bpmn:multiInstanceLoopCharacteristics${seq} />`);
        }
      }
    }
    if (n.event && isEvent(n.type)) {
      const dtag = EVENT_DEF_TAG[n.event];
      const did = `${capitalize(n.event)}EventDefinition_${n.id}`;
      if (n.event === 'timer') {
        inner.push(`${ind(lvl + 1)}<${dtag} id="${did}">`);
        inner.push(`${ind(lvl + 2)}<bpmn:timeDuration xsi:type="bpmn:tFormalExpression">${escapeXml(n.timer ?? 'PT1H')}</bpmn:timeDuration>`);
        inner.push(`${ind(lvl + 1)}</${dtag}>`);
      } else if (n.event === 'conditional') {
        inner.push(`${ind(lvl + 1)}<${dtag} id="${did}">`);
        inner.push(`${ind(lvl + 2)}<bpmn:condition xsi:type="bpmn:tFormalExpression" />`);
        inner.push(`${ind(lvl + 1)}</${dtag}>`);
      } else if (n.event === 'link') {
        inner.push(`${ind(lvl + 1)}<${dtag} id="${did}"${attr('name', n.linkName ?? n.name ?? 'Link')} />`);
      } else {
        inner.push(`${ind(lvl + 1)}<${dtag} id="${did}" />`);
      }
    }
    if (expanded) {
      for (const k of children.get(n.id)!) inner.push(nodeXml(k, lvl + 1));
      spec.flows.forEach((f, i) => {
        if (containerOfFlow(f) === n.id) inner.push(flowXml(f, flowIds[i], lvl + 1));
      });
    }
    if (!inner.length) return `${ind(lvl)}<${tag}${a} />`;
    return `${ind(lvl)}<${tag}${a}>\n${inner.join('\n')}\n${ind(lvl)}</${tag}>`;
  };

  const containerOfFlow = (f: FlowSpec): string | undefined => {
    const s = nodes.get(f.from)!;
    const sParent = s.type === 'boundaryEvent' ? nodes.get(s.attachedTo!)!.parent : s.parent;
    return sParent;
  };

  const flowXml = (f: FlowSpec, id: string, lvl: number): string => {
    const a = attr('id', id) + attr('name', f.name) + attr('sourceRef', f.from) + attr('targetRef', f.to);
    if (f.condition) {
      return `${ind(lvl)}<bpmn:sequenceFlow${a}>\n${ind(lvl + 1)}<bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">${escapeXml(f.condition)}</bpmn:conditionExpression>\n${ind(lvl)}</bpmn:sequenceFlow>`;
    }
    return `${ind(lvl)}<bpmn:sequenceFlow${a} />`;
  };

  const artifactIds = new Set((spec.artifacts ?? []).map((a) => a.id));
  function isDataArtifact(id: string) {
    const a = (spec.artifacts ?? []).find((x) => x.id === id);
    return !!a && (a.type === 'dataObject' || a.type === 'dataStore');
  }
  function assocId(as: AssociationSpec) {
    return as.id ?? `Association_${as.from}_${as.to}`;
  }

  const processIds = isCollab
    ? pools.filter((p) => !p.blackBox).map((p) => p.processId ?? `Process_${p.id}`)
    : ['Process_1'];

  const artifactProcess = (a: ArtifactSpec): string => {
    if (!isCollab) return 'Process_1';
    const pool = pools.find((p) => !p.blackBox && a.at[1] >= p.rows[0] - 0.5 && a.at[1] <= p.rows[1] + 0.5);
    return pool ? pool.processId ?? `Process_${pool.id}` : processIds[0];
  };

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_${escapeXml(spec.id ?? '1')}" targetNamespace="http://bpmn.io/schema/bpmn" exporter="BPMN Studio" exporterVersion="0.1.0">`
  );

  const groups = (spec.artifacts ?? []).filter((a) => a.type === 'group');
  for (const g of groups) {
    lines.push(`  <bpmn:category id="Category_${g.id}">`);
    lines.push(`    <bpmn:categoryValue id="CategoryValue_${g.id}"${attr('value', g.name)} />`);
    lines.push('  </bpmn:category>');
  }

  if (isCollab) {
    lines.push('  <bpmn:collaboration id="Collaboration_1">');
    for (const p of pools) {
      lines.push(`    <bpmn:participant${attr('id', p.id)}${attr('name', p.name)}${p.blackBox ? '' : attr('processRef', p.processId ?? `Process_${p.id}`)} />`);
    }
    for (const [i, m] of (spec.messageFlows ?? []).entries()) {
      lines.push(`    <bpmn:messageFlow${attr('id', m.id ?? `MessageFlow_${i + 1}`)}${attr('name', m.name)}${attr('sourceRef', m.from)}${attr('targetRef', m.to)} />`);
    }
    lines.push('  </bpmn:collaboration>');
  }

  for (const pid of processIds) {
    const pool = poolOfProcess.get(pid);
    lines.push(`  <bpmn:process id="${pid}"${attr('name', pool ? undefined : spec.name)} isExecutable="false">`);
    if (pool?.lanes?.length) {
      lines.push(`    <bpmn:laneSet id="LaneSet_${pool.id}">`);
      for (const l of pool.lanes) {
        lines.push(`      <bpmn:lane${attr('id', l.id)}${attr('name', l.name)}>`);
        for (const n of spec.nodes) {
          if (n.parent || processOfNode.get(n.id) !== pid) continue;
          const row = rootOf(n.type === 'boundaryEvent' ? nodes.get(n.attachedTo!)! : n).at![1];
          if (row >= l.rows[0] - 0.5 && row <= l.rows[1] + 0.5) lines.push(`        <bpmn:flowNodeRef>${n.id}</bpmn:flowNodeRef>`);
        }
        lines.push('      </bpmn:lane>');
      }
      lines.push('    </bpmn:laneSet>');
    }
    for (const n of spec.nodes) {
      if (n.parent || processOfNode.get(n.id) !== pid) continue;
      lines.push(nodeXml(n, 2));
    }
    spec.flows.forEach((f, i) => {
      if (containerOfFlow(f) !== undefined) return;
      if (processOfNode.get(f.from) !== pid) return;
      lines.push(flowXml(f, flowIds[i], 2));
    });
    for (const a of spec.artifacts ?? []) {
      if (artifactProcess(a) !== pid) continue;
      if (a.type === 'dataObject') {
        lines.push(`    <bpmn:dataObjectReference${attr('id', a.id)}${attr('name', a.name)} dataObjectRef="DataObject_${a.id}" />`);
        lines.push(`    <bpmn:dataObject id="DataObject_${a.id}" />`);
      } else if (a.type === 'dataStore') {
        lines.push(`    <bpmn:dataStoreReference${attr('id', a.id)}${attr('name', a.name)} />`);
      } else if (a.type === 'textAnnotation') {
        lines.push(`    <bpmn:textAnnotation id="${a.id}">\n      <bpmn:text>${escapeXml(a.name ?? '')}</bpmn:text>\n    </bpmn:textAnnotation>`);
      } else if (a.type === 'group') {
        lines.push(`    <bpmn:group id="${a.id}" categoryValueRef="CategoryValue_${a.id}" />`);
      }
    }
    for (const as of spec.associations ?? []) {
      if (isDataArtifact(as.from) || isDataArtifact(as.to)) continue;
      const anchor = artifactIds.has(as.to) ? as.from : as.to;
      const anchorProcess = nodes.has(anchor) ? processOfNode.get(anchor) : processIds[0];
      if (anchorProcess !== pid) continue;
      lines.push(`    <bpmn:association${attr('id', assocId(as))}${attr('sourceRef', as.from)}${attr('targetRef', as.to)} />`);
    }
    lines.push('  </bpmn:process>');
  }

  // ---- DI ------------------------------------------------------------------
  lines.push('  <bpmndi:BPMNDiagram id="BPMNDiagram_1">');
  lines.push(`    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="${isCollab ? 'Collaboration_1' : 'Process_1'}">`);
  const shape = (id: string, b: Bounds, extra = '', label?: Bounds) =>
    `      <bpmndi:BPMNShape id="${id}_di" bpmnElement="${id}"${extra}>\n        <dc:Bounds x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" />${
      label ? `\n        <bpmndi:BPMNLabel>\n          <dc:Bounds x="${label.x}" y="${label.y}" width="${label.w}" height="${label.h}" />\n        </bpmndi:BPMNLabel>` : ''
    }\n      </bpmndi:BPMNShape>`;

  // routes first, so that external labels can avoid the sides where flows attach
  const routes = spec.flows.map((f) => route(f));
  const usedSides = new Map<string, Set<string>>();
  const sideOf = (b: Bounds, [x, y]: [number, number]) => {
    if (y >= b.y + b.h - 1) return 'bottom';
    if (y <= b.y + 1) return 'top';
    if (x <= b.x + 1) return 'left';
    return 'right';
  };
  spec.flows.forEach((f, i) => {
    const pts = routes[i];
    for (const [id, pt] of [[f.from, pts[0]], [f.to, pts[pts.length - 1]]] as const) {
      const b = bounds.get(id);
      if (!b) continue;
      const set = usedSides.get(id) ?? new Set<string>();
      set.add(sideOf(b, pt));
      usedSides.set(id, set);
    }
  });
  const labelBounds = (n: NodeSpec): Bounds | undefined => {
    if (!n.name || (!isEvent(n.type) && !isGateway(n.type))) return undefined;
    const b = bounds.get(n.id)!;
    const w = isGateway(n.type) ? 100 : 90;
    const lines = Math.min(3, Math.ceil(n.name.length / 16));
    const h = 14 * lines;
    const used = usedSides.get(n.id) ?? new Set<string>();
    const cx = b.x + b.w / 2;
    if (n.type === 'boundaryEvent') {
      return { x: round(b.x + b.w + 2), y: round(b.y + b.h - 6), w: 60, h };
    }
    if (!used.has('bottom')) return { x: round(cx - w / 2), y: round(b.y + b.h + 5), w, h };
    if (!used.has('top')) return { x: round(cx - w / 2), y: round(b.y - h - 5), w, h };
    return { x: round(b.x + b.w + 4), y: round(b.y - h), w, h };
  };
  const edge = (id: string, pts: [number, number][]) =>
    `      <bpmndi:BPMNEdge id="${id}_di" bpmnElement="${id}">\n${pts
      .map(([x, y]) => `        <di:waypoint x="${round(x)}" y="${round(y)}" />`)
      .join('\n')}\n      </bpmndi:BPMNEdge>`;

  for (const p of pools) lines.push(shape(p.id, poolBounds.get(p.id)!, ' isHorizontal="true"'));
  for (const p of pools) for (const l of p.lanes ?? []) lines.push(shape(l.id, laneBounds.get(l.id)!, ' isHorizontal="true"'));
  for (const g of groups) lines.push(shape(g.id, artifactBounds.get(g.id)!));
  // parents before children so that sub-process shapes are drawn below their content
  const ordered = [...spec.nodes].sort((a, b) => depth(a) - depth(b));
  for (const n of ordered) {
    if (n.type === 'boundaryEvent') continue;
    const extra = n.type === 'subProcess' || n.type === 'callActivity' ? (expandedIds.has(n.id) ? ' isExpanded="true"' : n.type === 'subProcess' ? ' isExpanded="false"' : '') : '';
    lines.push(shape(n.id, bounds.get(n.id)!, extra, labelBounds(n)));
  }
  for (const n of spec.nodes) if (n.type === 'boundaryEvent') lines.push(shape(n.id, bounds.get(n.id)!, '', labelBounds(n)));
  for (const a of spec.artifacts ?? []) if (a.type !== 'group') lines.push(shape(a.id, artifactBounds.get(a.id)!));
  spec.flows.forEach((_f, i) => lines.push(edge(flowIds[i], routes[i])));

  const anyBounds = (id: string): Bounds | undefined => bounds.get(id) ?? artifactBounds.get(id) ?? poolBounds.get(id);
  for (const [i, m] of (spec.messageFlows ?? []).entries()) {
    const s = anyBounds(m.from)!;
    const t = anyBounds(m.to)!;
    if (!s || !t) throw new Error(`Message flow ${m.from} -> ${m.to} references unknown element`);
    const down = t.y > s.y;
    const sIsPool = poolBounds.has(m.from);
    const tIsPool = poolBounds.has(m.to);
    let sx = s.x + s.w / 2;
    let tx = t.x + t.w / 2;
    if (sIsPool) sx = tx;
    if (tIsPool) tx = sx;
    const sy = down ? s.y + s.h : s.y;
    const ty = down ? t.y : t.y + t.h;
    const pts: [number, number][] =
      Math.abs(sx - tx) < 2 ? [[sx, sy], [tx, ty]] : [[sx, sy], [sx, (sy + ty) / 2], [tx, (sy + ty) / 2], [tx, ty]];
    lines.push(edge(m.id ?? `MessageFlow_${i + 1}`, pts));
  }
  for (const as of spec.associations ?? []) {
    const s = anyBounds(as.from);
    const t = anyBounds(as.to);
    if (!s || !t) throw new Error(`Association ${as.from} -> ${as.to} references unknown element`);
    const sc: [number, number] = [s.x + s.w / 2, s.y + s.h / 2];
    const tc: [number, number] = [t.x + t.w / 2, t.y + t.h / 2];
    lines.push(edge(assocId(as), [clipToBounds(sc, tc, s), clipToBounds(tc, sc, t)]));
  }
  lines.push('    </bpmndi:BPMNPlane>');
  lines.push('  </bpmndi:BPMNDiagram>');
  lines.push('</bpmn:definitions>');
  return lines.join('\n') + '\n';
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Point where the segment from `from` (inside b) towards `to` leaves the rectangle b. */
function clipToBounds(from: [number, number], to: [number, number], b: Bounds): [number, number] {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (dx === 0 && dy === 0) return from;
  const tx = dx !== 0 ? (b.w / 2) / Math.abs(dx) : Infinity;
  const ty = dy !== 0 ? (b.h / 2) / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty, 1);
  return [from[0] + dx * t, from[1] + dy * t];
}

/** A minimal empty diagram with one start event, for "New diagram". */
export function emptyDiagramXml(name = 'New process'): string {
  return buildBpmnXml({
    name,
    nodes: [{ id: 'StartEvent_1', type: 'startEvent', name: 'Start', at: [0, 0] }],
    flows: []
  });
}
