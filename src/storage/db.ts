/**
 * Local-first persistence in IndexedDB.
 *
 * Stores:
 *  - diagrams     BPMN 2.0 XML with metadata (process model metadata contract)
 *  - simConfigs   simulation configuration per diagram (kept separate from XML)
 *  - runs         simulation run summaries
 *  - progress     learner progress (single record)
 *  - settings     UI settings (single record)
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { SimulationConfig } from '../domain/simulation/config';
import type { ProcessModelMetadata, StoredRunSummary, LearnerProgress, AppSettings } from '../domain/contracts';
import { PROCESS_MODEL_SCHEMA_VERSION, emptyProgress } from '../domain/contracts';

export interface StoredDiagram extends ProcessModelMetadata {
  xml: string;
  /** SVG preview for library cards. */
  svg?: string;
}

interface StudioDB extends DBSchema {
  diagrams: { key: string; value: StoredDiagram; indexes: { updatedAt: string } };
  simConfigs: { key: string; value: { diagramId: string; config: SimulationConfig } };
  runs: { key: string; value: StoredRunSummary; indexes: { diagramId: string } };
  progress: { key: string; value: LearnerProgress };
  settings: { key: string; value: AppSettings };
}

const DB_NAME = 'bpmn-studio';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<StudioDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<StudioDB>> {
  if (!dbPromise) {
    dbPromise = openDB<StudioDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const diagrams = db.createObjectStore('diagrams', { keyPath: 'id' });
        diagrams.createIndex('updatedAt', 'updatedAt');
        db.createObjectStore('simConfigs', { keyPath: 'diagramId' });
        const runs = db.createObjectStore('runs', { keyPath: 'runId' });
        runs.createIndex('diagramId', 'diagramId');
        db.createObjectStore('progress', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'id' });
      }
    });
  }
  return dbPromise;
}

/** For tests: forget the cached connection. */
export function resetDbConnection() {
  dbPromise = null;
}

export function newId(prefix = 'd'): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rnd}`;
}

// ---- diagrams --------------------------------------------------------------

export async function listDiagrams(): Promise<StoredDiagram[]> {
  const db = await getDb();
  const all = await db.getAll('diagrams');
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDiagram(id: string): Promise<StoredDiagram | undefined> {
  return (await getDb()).get('diagrams', id);
}

export async function createDiagram(input: Pick<StoredDiagram, 'name' | 'xml'> & Partial<StoredDiagram>): Promise<StoredDiagram> {
  const now = new Date().toISOString();
  const d: StoredDiagram = {
    schemaVersion: PROCESS_MODEL_SCHEMA_VERSION,
    id: input.id ?? newId(),
    name: input.name,
    description: input.description ?? '',
    xml: input.xml,
    svg: input.svg,
    createdAt: now,
    updatedAt: now,
    version: 1,
    role: input.role,
    pairId: input.pairId,
    baseDiagramId: input.baseDiagramId,
    origin: input.origin ?? { kind: 'blank' },
    tags: input.tags ?? []
  };
  await (await getDb()).put('diagrams', d);
  return d;
}

/** Save XML (and optionally metadata). Increments the model version when the XML changed. */
export async function saveDiagram(id: string, patch: Partial<Omit<StoredDiagram, 'id' | 'createdAt'>>): Promise<StoredDiagram> {
  const db = await getDb();
  const existing = await db.get('diagrams', id);
  if (!existing) throw new Error(`Diagram ${id} not found`);
  const xmlChanged = patch.xml !== undefined && patch.xml !== existing.xml;
  const next: StoredDiagram = {
    ...existing,
    ...patch,
    id,
    version: xmlChanged ? existing.version + 1 : existing.version,
    updatedAt: new Date().toISOString()
  };
  await db.put('diagrams', next);
  return next;
}

export async function deleteDiagram(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['diagrams', 'simConfigs', 'runs'], 'readwrite');
  await tx.objectStore('diagrams').delete(id);
  await tx.objectStore('simConfigs').delete(id);
  const runIndex = tx.objectStore('runs').index('diagramId');
  for (const key of await runIndex.getAllKeys(id)) await tx.objectStore('runs').delete(key);
  await tx.done;
}

/** Duplicate a diagram, its simulation configuration and optionally mark the pair as AS-IS / TO-BE. */
export async function duplicateDiagram(id: string, options: { name?: string; asToBe?: boolean } = {}): Promise<StoredDiagram> {
  const source = await getDiagram(id);
  if (!source) throw new Error(`Diagram ${id} not found`);
  const pairId = options.asToBe ? source.pairId ?? newId('pair') : undefined;
  if (options.asToBe) await saveDiagram(source.id, { role: 'as-is', pairId });
  const copy = await createDiagram({
    name: options.name ?? (options.asToBe ? `${source.name.replace(/\s*\((AS-IS|TO-BE)\)$/i, '')} (TO-BE)` : `${source.name} (copy)`),
    xml: source.xml,
    svg: source.svg,
    description: source.description,
    role: options.asToBe ? 'to-be' : undefined,
    pairId,
    baseDiagramId: source.id,
    origin: { kind: 'duplicate', ref: source.id },
    tags: source.tags
  });
  const cfg = await getSimConfig(source.id);
  if (cfg) await saveSimConfig(copy.id, { ...structuredClone(cfg), id: `cfg-${copy.id}`, name: options.asToBe ? 'TO-BE scenario' : cfg.name });
  if (options.asToBe && !/\(AS-IS\)$/i.test(source.name)) {
    await saveDiagram(source.id, { name: `${source.name.replace(/\s*\(TO-BE\)$/i, '')} (AS-IS)` });
  }
  return copy;
}

// ---- simulation configs -------------------------------------------------------

export async function getSimConfig(diagramId: string): Promise<SimulationConfig | undefined> {
  return (await (await getDb()).get('simConfigs', diagramId))?.config;
}

export async function saveSimConfig(diagramId: string, config: SimulationConfig): Promise<void> {
  await (await getDb()).put('simConfigs', { diagramId, config });
}

// ---- runs -----------------------------------------------------------------

export async function saveRun(run: StoredRunSummary): Promise<void> {
  await (await getDb()).put('runs', run);
}

export async function listRuns(diagramId?: string): Promise<StoredRunSummary[]> {
  const db = await getDb();
  const runs = diagramId ? await db.getAllFromIndex('runs', 'diagramId', diagramId) : await db.getAll('runs');
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteRun(runId: string): Promise<void> {
  await (await getDb()).delete('runs', runId);
}

// ---- progress & settings ----------------------------------------------------

export async function getProgress(): Promise<LearnerProgress> {
  return (await (await getDb()).get('progress', 'me')) ?? emptyProgress();
}

export async function saveProgress(p: LearnerProgress): Promise<void> {
  await (await getDb()).put('progress', { ...p, id: 'me', updatedAt: new Date().toISOString() });
}

export async function getSettings(): Promise<AppSettings> {
  return (await (await getDb()).get('settings', 'settings')) ?? { id: 'settings', theme: 'system' };
}

export async function saveSettings(s: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await (await getDb()).put('settings', { ...current, ...s, id: 'settings' });
}

// ---- backup ---------------------------------------------------------------

export interface Backup {
  format: 'bpmn-studio-backup';
  version: 1;
  exportedAt: string;
  diagrams: StoredDiagram[];
  simConfigs: Array<{ diagramId: string; config: SimulationConfig }>;
  progress: LearnerProgress;
}

export async function exportBackup(): Promise<Backup> {
  const db = await getDb();
  return {
    format: 'bpmn-studio-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    diagrams: await db.getAll('diagrams'),
    simConfigs: await db.getAll('simConfigs'),
    progress: await getProgress()
  };
}

export async function importBackup(b: Backup): Promise<number> {
  if (b.format !== 'bpmn-studio-backup') throw new Error('Not a BPMN Studio backup file');
  const db = await getDb();
  const tx = db.transaction(['diagrams', 'simConfigs', 'progress'], 'readwrite');
  for (const d of b.diagrams) await tx.objectStore('diagrams').put(d);
  for (const c of b.simConfigs) await tx.objectStore('simConfigs').put(c);
  if (b.progress) await tx.objectStore('progress').put({ ...b.progress, id: 'me' });
  await tx.done;
  return b.diagrams.length;
}
