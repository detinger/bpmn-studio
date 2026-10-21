/** Application services for creating and opening diagrams. */
import { buildBpmnXml, emptyDiagramXml, type DiagramSpec } from '../domain/bpmn/builder';
import { parseBpmnXml, looksLikeBpmn } from '../domain/bpmn/parse';
import { createDefaultConfig, syncConfigWithGraph, type SimulationConfig } from '../domain/simulation/config';
import { EXAMPLES, getExample, type ExampleDiagram } from '../data/examples';
import { getTutorial } from '../data/tutorials';
import { applyPreset } from '../data/examples/preset';
import { createDiagram, getSimConfig, listDiagrams, saveDiagram, saveSimConfig, type StoredDiagram, newId } from '../storage/db';
import type { ProcessModelMetadata } from '../domain/contracts';

export async function createBlankDiagram(name = 'Untitled process'): Promise<StoredDiagram> {
  return createDiagram({ name, xml: emptyDiagramXml(name), origin: { kind: 'blank' } });
}

/** Create a diagram (and simulation config) from a spec. */
export async function createFromSpec(
  name: string,
  spec: DiagramSpec,
  origin: ProcessModelMetadata['origin'],
  extras: Partial<StoredDiagram> = {},
  preset?: ExampleDiagram['sim']
): Promise<StoredDiagram> {
  const xml = buildBpmnXml(spec);
  const d = await createDiagram({ name, xml, origin, ...extras });
  const { graph } = await parseBpmnXml(xml);
  let config = createDefaultConfig(graph, `cfg-${d.id}`);
  if (preset) config = applyPreset(config, preset, graph);
  await saveSimConfig(d.id, config);
  return d;
}

/** Open an example as a new diagram. Pair examples (AS-IS/TO-BE) are linked. */
export async function openExample(exampleId: string): Promise<StoredDiagram> {
  const ex = getExample(exampleId);
  if (!ex) throw new Error(`Unknown example ${exampleId}`);
  const asIsPartner = EXAMPLES.find((e) => e.toBeOf === ex.id);
  const extras: Partial<StoredDiagram> = { description: ex.description, tags: ex.concepts };
  if (ex.toBeOf || asIsPartner) extras.role = ex.toBeOf ? 'to-be' : 'as-is';
  return createFromSpec(ex.name, ex.spec, { kind: 'example', ref: ex.id }, extras, ex.sim);
}

/** Open an AS-IS example together with its suggested TO-BE, linked as a pair. */
export async function openExamplePair(asIsId: string): Promise<{ asIs: StoredDiagram; toBe: StoredDiagram }> {
  const asIsEx = getExample(asIsId)!;
  const toBeEx = EXAMPLES.find((e) => e.toBeOf === asIsId);
  if (!toBeEx) throw new Error('Example has no TO-BE alternative');
  const pairId = newId('pair');
  const asIs = await createFromSpec(asIsEx.name, asIsEx.spec, { kind: 'example', ref: asIsEx.id }, { role: 'as-is', pairId, description: asIsEx.description }, asIsEx.sim);
  const toBe = await createFromSpec(toBeEx.name, toBeEx.spec, { kind: 'example', ref: toBeEx.id }, { role: 'to-be', pairId, baseDiagramId: asIs.id, description: toBeEx.description }, toBeEx.sim);
  return { asIs, toBe };
}

/** The student's workspace diagram for a tutorial; an existing one is continued unless `restart` is set. */
export async function openTutorialWorkspace(tutorialId: string, restart = false): Promise<StoredDiagram> {
  const tutorial = getTutorial(tutorialId);
  if (!tutorial) throw new Error(`Unknown tutorial ${tutorialId}`);
  if (!restart) {
    const existing = (await listDiagrams()).find((d) => d.origin?.kind === 'tutorial' && d.origin.ref === tutorialId);
    if (existing) return existing;
  }
  const name = `Tutorial: ${tutorial.title}`;
  if (!tutorial.start) return createDiagram({ name, xml: emptyDiagramXml(name), origin: { kind: 'tutorial', ref: tutorialId } });
  return createFromSpec(name, tutorial.start, { kind: 'tutorial', ref: tutorialId }, { description: tutorial.description });
}

export class ImportError extends Error {}

/** Import BPMN XML text as a new diagram. */
export async function importBpmn(xml: string, fileName = 'Imported process'): Promise<{ diagram: StoredDiagram; warnings: string[] }> {
  if (!looksLikeBpmn(xml)) throw new ImportError('The file does not look like a BPMN 2.0 XML document.');
  let parsed;
  try {
    parsed = await parseBpmnXml(xml);
  } catch (err) {
    throw new ImportError(`The BPMN file could not be read: ${err instanceof Error ? err.message : String(err)}`);
  }
  const procName = Object.values(parsed.graph.scopes).find((s) => s.kind === 'process' && s.name)?.name;
  const name = procName || fileName.replace(/\.(bpmn|xml)$/i, '') || 'Imported process';
  const diagram = await createDiagram({ name, xml, origin: { kind: 'import', ref: fileName } });
  await saveSimConfig(diagram.id, createDefaultConfig(parsed.graph, `cfg-${diagram.id}`));
  return { diagram, warnings: parsed.warnings };
}

/** Load the simulation config of a diagram, creating or syncing it with the current model. */
export async function loadSyncedConfig(diagram: StoredDiagram): Promise<{ config: SimulationConfig; graphError?: string }> {
  let parsed;
  try {
    parsed = await parseBpmnXml(diagram.xml);
  } catch (err) {
    return { config: (await getSimConfig(diagram.id)) ?? ({} as SimulationConfig), graphError: String(err) };
  }
  const existing = await getSimConfig(diagram.id);
  const base = existing ?? createDefaultConfig(parsed.graph, `cfg-${diagram.id}`);
  const { config, added, removed } = syncConfigWithGraph(base, parsed.graph);
  if (!existing || added.length || removed.length) await saveSimConfig(diagram.id, config);
  return { config };
}

export async function renameDiagram(id: string, name: string) {
  return saveDiagram(id, { name });
}
