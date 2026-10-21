/** Runs simulation experiments in a Web Worker (falls back to the main thread). */
import type { SimulationConfig } from '../../domain/simulation/config';
import type { ExperimentMeta, SimulationRun } from '../../domain/simulation/experiment';
import type { SupportReport } from '../../domain/simulation/support';

export interface WorkerRequest {
  id: number;
  xml: string;
  config: SimulationConfig;
  meta: ExperimentMeta;
}

export type WorkerResponse =
  | { id: number; type: 'progress'; done: number; total: number }
  | { id: number; type: 'result'; run: SimulationRun }
  | { id: number; type: 'error'; message: string; support?: SupportReport };

export class SimulationError extends Error {
  constructor(
    message: string,
    readonly support?: SupportReport
  ) {
    super(message);
  }
}

let counter = 0;

export interface RunHandle {
  promise: Promise<SimulationRun>;
  cancel: () => void;
}

export function runSimulation(xml: string, config: SimulationConfig, meta: ExperimentMeta, onProgress?: (done: number, total: number) => void): RunHandle {
  const id = ++counter;
  if (typeof Worker === 'undefined') {
    const promise = (async () => {
      const { parseBpmnXml } = await import('../../domain/bpmn/parse');
      const { runExperiment } = await import('../../domain/simulation/experiment');
      const { graph } = await parseBpmnXml(xml);
      return runExperiment(graph, config, meta, onProgress);
    })();
    return { promise, cancel: () => undefined };
  }
  const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  let rejectFn: (e: Error) => void = () => undefined;
  const promise = new Promise<SimulationRun>((resolve, reject) => {
    rejectFn = reject;
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === 'progress') onProgress?.(m.done, m.total);
      else if (m.type === 'result') {
        resolve(m.run);
        worker.terminate();
      } else {
        reject(new SimulationError(m.message, m.support));
        worker.terminate();
      }
    };
    worker.onerror = (e) => {
      reject(new SimulationError(e.message || 'The simulation worker failed.'));
      worker.terminate();
    };
    worker.postMessage({ id, xml, config: structuredClone(config), meta } satisfies WorkerRequest);
  });
  return {
    promise,
    cancel: () => {
      worker.terminate();
      rejectFn(new SimulationError('Simulation cancelled.'));
    }
  };
}
