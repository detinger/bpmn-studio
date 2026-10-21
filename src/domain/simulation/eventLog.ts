/**
 * Event log export (CSV and IEEE XES) of simulated executions, for use in
 * process mining tools (e.g. Process Mining Detective, ProM, Disco, PM4Py).
 */
import type { EventLogEntry } from './engine';
import type { EventLogRecord } from '../contracts';

export const EVENT_LOG_SCHEMA_VERSION = 1;

export interface EventLogMeta {
  modelName: string;
  runId: string;
  seed: number;
  replication: number;
  /** ISO timestamp corresponding to simulation time 0. */
  epoch: string;
}

function ts(epochMs: number, minutes: number): string {
  return new Date(epochMs + minutes * 60_000).toISOString();
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface EventLogDocument {
  schemaVersion: typeof EVENT_LOG_SCHEMA_VERSION;
  meta: EventLogMeta;
  events: EventLogRecord[];
}

/** JSON event log (contract: schemas/event-log.schema.json), one start and one end event per activity instance. */
export function eventLogToJson(entries: EventLogEntry[], meta: EventLogMeta): EventLogDocument {
  const epoch = Date.parse(meta.epoch);
  const events: Array<{ t: number; r: EventLogRecord }> = [];
  for (const e of entries) {
    const base = { caseId: `case-${e.caseId}`, activity: e.activity, activityId: e.activityId, resource: e.resource };
    events.push({ t: e.start, r: { ...base, lifecycle: 'start', timestamp: ts(epoch, e.start) } });
    events.push({ t: e.end, r: { ...base, lifecycle: e.status === 'complete' ? 'complete' : 'ate_abort', timestamp: ts(epoch, e.end) } });
  }
  events.sort((a, b) => a.t - b.t);
  return { schemaVersion: EVENT_LOG_SCHEMA_VERSION, meta, events: events.map((e) => e.r) };
}

/** One row per lifecycle event (start/complete), sorted by timestamp. */
export function eventLogToCsv(entries: EventLogEntry[], meta: EventLogMeta): string {
  const epoch = Date.parse(meta.epoch);
  const rows: Array<{ t: number; cells: (string | number)[] }> = [];
  for (const e of entries) {
    const base = [`case-${e.caseId}`, e.activity, e.activityId, e.resource];
    rows.push({ t: e.start, cells: [...base, 'start', ts(epoch, e.start), e.start.toFixed(3), (e.start - e.enqueued).toFixed(3), ''] });
    rows.push({
      t: e.end,
      cells: [...base, e.status === 'complete' ? 'complete' : 'ate_abort', ts(epoch, e.end), e.end.toFixed(3), '', e.cost.toFixed(4)]
    });
  }
  rows.sort((a, b) => a.t - b.t);
  const header = ['case_id', 'activity', 'activity_id', 'resource', 'lifecycle', 'timestamp', 'sim_time_min', 'waiting_min', 'cost'];
  return [header.join(','), ...rows.map((r) => r.cells.map(csvCell).join(','))].join('\n') + '\n';
}

function xmlEsc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** IEEE 1849-2016 XES with concept, lifecycle, org, time and cost extensions. */
export function eventLogToXes(entries: EventLogEntry[], meta: EventLogMeta): string {
  const epoch = Date.parse(meta.epoch);
  const byCase = new Map<number, EventLogEntry[]>();
  for (const e of entries) {
    const list = byCase.get(e.caseId) ?? [];
    list.push(e);
    byCase.set(e.caseId, list);
  }
  const out: string[] = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push('<log xes.version="1849-2016" xes.features="nested-attributes" xmlns="http://www.xes-standard.org/">');
  out.push('  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>');
  out.push('  <extension name="Lifecycle" prefix="lifecycle" uri="http://www.xes-standard.org/lifecycle.xesext"/>');
  out.push('  <extension name="Organizational" prefix="org" uri="http://www.xes-standard.org/org.xesext"/>');
  out.push('  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>');
  out.push('  <extension name="Cost" prefix="cost" uri="http://www.xes-standard.org/cost.xesext"/>');
  out.push('  <global scope="trace"><string key="concept:name" value="__INVALID__"/></global>');
  out.push('  <global scope="event"><string key="concept:name" value="__INVALID__"/><string key="lifecycle:transition" value="complete"/><date key="time:timestamp" value="1970-01-01T00:00:00.000Z"/></global>');
  out.push('  <classifier name="Activity" keys="concept:name"/>');
  out.push(`  <string key="concept:name" value="${xmlEsc(meta.modelName)}"/>`);
  out.push(`  <string key="source" value="BPMN Studio simulation ${xmlEsc(meta.runId)} (seed ${meta.seed}, replication ${meta.replication + 1})"/>`);
  for (const [caseId, list] of [...byCase.entries()].sort((a, b) => a[0] - b[0])) {
    out.push('  <trace>');
    out.push(`    <string key="concept:name" value="case-${caseId}"/>`);
    const events: Array<{ t: number; xml: string }> = [];
    for (const e of list) {
      const common = `<string key="concept:name" value="${xmlEsc(e.activity)}"/><string key="org:resource" value="${xmlEsc(e.resource)}"/>`;
      events.push({ t: e.start, xml: `    <event>${common}<string key="lifecycle:transition" value="start"/><date key="time:timestamp" value="${ts(epoch, e.start)}"/></event>` });
      events.push({
        t: e.end,
        xml: `    <event>${common}<string key="lifecycle:transition" value="${e.status === 'complete' ? 'complete' : 'ate_abort'}"/><date key="time:timestamp" value="${ts(epoch, e.end)}"/><float key="cost:total" value="${e.cost.toFixed(4)}"/></event>`
      });
    }
    events.sort((a, b) => a.t - b.t);
    out.push(...events.map((e) => e.xml));
    out.push('  </trace>');
  }
  out.push('</log>');
  return out.join('\n') + '\n';
}
