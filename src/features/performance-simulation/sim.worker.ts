/// <reference lib="webworker" />
/**
 * Web Worker running performance simulations off the main thread.
 */
import { parseBpmnXml } from '../../domain/bpmn/parse';
import { runExperiment, SimulationNotRunnableError } from '../../domain/simulation/experiment';
import type { WorkerRequest, WorkerResponse } from './simClient';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, xml, config, meta } = e.data;
  const post = (m: WorkerResponse) => ctx.postMessage(m);
  try {
    const { graph } = await parseBpmnXml(xml);
    const run = runExperiment(graph, config, meta, (done, total) => post({ id, type: 'progress', done, total }));
    post({ id, type: 'result', run });
  } catch (err) {
    post({
      id,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      support: err instanceof SimulationNotRunnableError ? err.support : undefined
    });
  }
};
