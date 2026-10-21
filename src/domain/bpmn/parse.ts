import { BpmnModdle } from 'bpmn-moddle';
import { buildProcessGraph, type ProcessGraph } from './graph';

export interface ParsedModel {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  definitions: any;
  graph: ProcessGraph;
  /** Non-fatal import warnings reported by bpmn-moddle (unknown attributes, unresolved references, …). */
  warnings: string[];
}

export class BpmnParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BpmnParseError';
  }
}

/**
 * Parse BPMN 2.0 XML into moddle definitions and a ProcessGraph.
 * Throws BpmnParseError for XML that is not well-formed or not BPMN.
 */
export async function parseBpmnXml(xml: string): Promise<ParsedModel> {
  const moddle = BpmnModdle();
  let result;
  try {
    result = await moddle.fromXML(xml, 'bpmn:Definitions');
  } catch (err) {
    throw new BpmnParseError(err instanceof Error ? err.message : String(err));
  }
  const warnings = (result.warnings ?? []).map((w: { message?: string }) => w.message ?? String(w));
  return {
    definitions: result.rootElement,
    graph: buildProcessGraph(result.rootElement),
    warnings
  };
}

/** Lightweight check whether XML text looks like a BPMN document before parsing. */
export function looksLikeBpmn(text: string): boolean {
  return /<([\w-]+:)?definitions[\s>]/.test(text) && text.includes('http://www.omg.org/spec/BPMN/20100524/MODEL');
}
