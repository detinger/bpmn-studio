/**
 * Integration of persistence and application services on IndexedDB
 * (fake-indexeddb): examples, AS-IS/TO-BE pairs, import/export, backups,
 * tutorial and challenge workspaces.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import {
  createDiagram,
  deleteDiagram,
  duplicateDiagram,
  exportBackup,
  getDiagram,
  getProgress,
  getSimConfig,
  importBackup,
  listDiagrams,
  listRuns,
  resetDbConnection,
  saveDiagram,
  saveProgress,
  saveRun
} from '../../src/storage/db';
import { ImportError, importBpmn, loadSyncedConfig, openExample, openExamplePair, openTutorialWorkspace } from '../../src/services/diagrams';
import { findChallengeDiagram, startChallengeWorkspace } from '../../src/features/challenges/assess';
import { getChallenge } from '../../src/data/challenges';
import { getExample } from '../../src/data/examples';
import { buildBpmnXml } from '../../src/domain/bpmn/builder';
import { parseBpmnXml } from '../../src/domain/bpmn/parse';
import { emptyProgress, type StoredRunSummary } from '../../src/domain/contracts';
import type { ModelChallenge } from '../../src/domain/assessment/types';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbConnection();
});

describe('diagram persistence', () => {
  it('opens an example with its simulation preset stored separately from the XML', async () => {
    const d = await openExample('claims-as-is');
    const stored = await getDiagram(d.id);
    expect(stored?.origin).toEqual({ kind: 'example', ref: 'claims-as-is' });
    expect(stored?.xml).not.toMatch(/simulation|resourcePool/i);
    const cfg = await getSimConfig(d.id);
    const preset = getExample('claims-as-is')!.sim!;
    expect(cfg?.arrival).toEqual(preset.arrival);
    expect(cfg?.resourcePools.map((p) => p.id).sort()).toEqual(preset.pools.map((p) => p.id).sort());
  });

  it('increments the model version only when the XML changes', async () => {
    const d = await openExample('order-fulfillment');
    const renamed = await saveDiagram(d.id, { name: 'Renamed' });
    expect(renamed.version).toBe(1);
    const changed = await saveDiagram(d.id, { xml: d.xml.replace('Check order', 'Verify order') });
    expect(changed.version).toBe(2);
    expect((await listDiagrams())[0].id).toBe(d.id);
  });

  it('keeps element ids stable through save and reload', async () => {
    const ex = getExample('order-fulfillment')!;
    const d = await openExample(ex.id);
    const { graph } = await parseBpmnXml((await getDiagram(d.id))!.xml);
    const ids = ex.spec.nodes.map((n) => n.id);
    for (const id of ids) expect(graph.nodes[id], id).toBeTruthy();
  });

  it('duplicates a model as TO-BE and links the pair', async () => {
    const asIs = await openExample('order-fulfillment');
    const toBe = await duplicateDiagram(asIs.id, { asToBe: true });
    const source = await getDiagram(asIs.id);
    expect(source?.role).toBe('as-is');
    expect(source?.name).toMatch(/\(AS-IS\)$/);
    expect(toBe.role).toBe('to-be');
    expect(toBe.pairId).toBe(source?.pairId);
    expect(toBe.baseDiagramId).toBe(asIs.id);
    const [c1, c2] = [await getSimConfig(asIs.id), await getSimConfig(toBe.id)];
    expect(c2?.id).not.toBe(c1?.id);
    expect(c2?.arrival).toEqual(c1?.arrival);
  });

  it('opens an AS-IS / TO-BE example pair', async () => {
    const { asIs, toBe } = await openExamplePair('claims-as-is');
    expect(asIs.pairId).toBeTruthy();
    expect(toBe.pairId).toBe(asIs.pairId);
    expect([asIs.role, toBe.role]).toEqual(['as-is', 'to-be']);
  });

  it('deletes a diagram with its configuration and runs', async () => {
    const d = await openExample('order-fulfillment');
    await saveRun({ schemaVersion: 1, runId: 'r1', diagramId: d.id } as StoredRunSummary);
    await deleteDiagram(d.id);
    expect(await getDiagram(d.id)).toBeUndefined();
    expect(await getSimConfig(d.id)).toBeUndefined();
    expect(await listRuns(d.id)).toEqual([]);
  });

  it('syncs the configuration when elements are added to the model', async () => {
    const d = await openExample('order-fulfillment');
    const xml = buildBpmnXml({
      ...getExample('order-fulfillment')!.spec,
      nodes: [...getExample('order-fulfillment')!.spec.nodes, { id: 'Task_Extra', type: 'task', name: 'Extra work', at: [3, 3] }]
    });
    const saved = await saveDiagram(d.id, { xml });
    const { config } = await loadSyncedConfig(saved);
    expect(config.activities.Task_Extra).toBeTruthy();
  });
});

describe('import and export', () => {
  it('imports BPMN 2.0 XML and names the diagram after the process', async () => {
    const xml = buildBpmnXml(getExample('loan-application')!.spec);
    const { diagram, warnings } = await importBpmn(xml, 'loan.bpmn');
    expect(warnings).toEqual([]);
    expect(diagram.origin).toEqual({ kind: 'import', ref: 'loan.bpmn' });
    expect(await getSimConfig(diagram.id)).toBeTruthy();
    // exported XML is the stored XML, unmodified
    expect((await getDiagram(diagram.id))?.xml).toBe(xml);
  });

  it('rejects files that are not BPMN', async () => {
    await expect(importBpmn('<html><body>nope</body></html>', 'page.html')).rejects.toBeInstanceOf(ImportError);
    await expect(importBpmn('hello', 'x.txt')).rejects.toBeInstanceOf(ImportError);
  });

  it('restores a backup into an empty browser profile', async () => {
    const d = await openExample('order-fulfillment');
    await saveProgress({ ...emptyProgress(), completedConcepts: ['process-basics'], badges: ['first-model'] });
    const backup = JSON.parse(JSON.stringify(await exportBackup()));

    globalThis.indexedDB = new IDBFactory();
    resetDbConnection();
    expect(await listDiagrams()).toEqual([]);

    expect(await importBackup(backup)).toBe(1);
    expect((await getDiagram(d.id))?.xml).toBe(d.xml);
    expect(await getSimConfig(d.id)).toBeTruthy();
    expect((await getProgress()).completedConcepts).toEqual(['process-basics']);
    await expect(importBackup({ ...backup, format: 'other' })).rejects.toThrow();
  });
});

describe('learning workspaces', () => {
  it('continues a tutorial workspace unless restarted', async () => {
    const a = await openTutorialWorkspace('decisions');
    const b = await openTutorialWorkspace('decisions');
    expect(b.id).toBe(a.id);
    expect(a.origin).toEqual({ kind: 'tutorial', ref: 'decisions' });
    const c = await openTutorialWorkspace('decisions', true);
    expect(c.id).not.toBe(a.id);
  });

  it('starts a challenge workspace from the broken model and finds it again', async () => {
    const ch = getChallenge('fix-loop') as ModelChallenge;
    expect(await findChallengeDiagram(ch.id)).toBeUndefined();
    const d = await startChallengeWorkspace(ch);
    expect((await findChallengeDiagram(ch.id))?.id).toBe(d.id);
    const { graph } = await parseBpmnXml(d.xml);
    expect(graph.nodes.Review).toBeTruthy();
  });

  it('stores a blank diagram with a start event', async () => {
    const d = await createDiagram({ name: 'x', xml: buildBpmnXml({ nodes: [{ id: 'S', type: 'startEvent', at: [0, 0] }], flows: [] }) });
    expect((await parseBpmnXml(d.xml)).graph.nodes.S).toBeTruthy();
  });
});
