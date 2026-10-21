import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertOctagon, FlaskConical, History, Loader2, PenTool, Play, Scale, Square, Trash2 } from 'lucide-react';
import { getDiagram, listDiagrams, listRuns, saveRun, saveSimConfig, deleteRun, type StoredDiagram } from '../../storage/db';
import { loadSyncedConfig } from '../../services/diagrams';
import { parseBpmnXml } from '../../domain/bpmn/parse';
import type { ProcessGraph } from '../../domain/bpmn/graph';
import type { SimulationConfig } from '../../domain/simulation/config';
import { checkPerformanceSupport } from '../../domain/simulation/support';
import type { SimulationRun } from '../../domain/simulation/experiment';
import type { StoredRunSummary } from '../../domain/contracts';
import { ConfigEditor } from './ConfigEditor';
import { runSimulation, SimulationError, type RunHandle } from './simClient';
import { Dashboard } from '../analytics/Dashboard';
import { useProgress } from '../../app/progress';
import { useToast } from '../../app/toast';
import { EmptyState, ProgressBar } from '../../components/ui';
import { formatDuration, formatPercent, round } from '../../utils/duration';

export function toRunSummary(run: SimulationRun, diagram: StoredDiagram): StoredRunSummary {
  const rep0 = run.replications[0];
  const sum = (f: (r: SimulationRun['replications'][number]) => number) => run.replications.reduce((a, r) => a + f(r), 0);
  return {
    schemaVersion: 1,
    runId: run.runId,
    diagramId: diagram.id,
    modelName: diagram.name,
    modelVersion: diagram.version,
    configVersion: run.configVersion,
    seed: run.seed,
    replicationCount: run.replicationCount,
    createdAt: run.createdAt,
    config: run.config,
    support: run.support,
    kpis: run.kpis,
    activities: run.activities,
    pools: run.pools,
    warnings: run.warnings,
    cycleTimeSample: rep0?.samples.cycleTimes.slice(0, 2000) ?? [],
    waitingTimeSample: rep0?.samples.waitingTimes.slice(0, 2000) ?? [],
    cases: { measured: sum((r) => r.cases.measured), completed: sum((r) => r.cases.completed), incomplete: sum((r) => r.cases.incomplete), rejected: sum((r) => r.cases.rejected) }
  };
}

export default function SimulationPage() {
  const { diagramId } = useParams();
  const navigate = useNavigate();
  const notify = useToast();
  const { recordExperiment } = useProgress();
  const [diagrams, setDiagrams] = useState<StoredDiagram[]>([]);
  const [diagram, setDiagram] = useState<StoredDiagram | null>(null);
  const [graph, setGraph] = useState<ProcessGraph | null>(null);
  const [config, setConfig] = useState<SimulationConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<SimulationRun | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [history, setHistory] = useState<StoredRunSummary[]>([]);
  const handle = useRef<RunHandle | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    listDiagrams().then(setDiagrams);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!diagramId) {
        const all = await listDiagrams();
        if (all[0] && !cancelled) navigate(`/simulate/${all[0].id}`, { replace: true });
        return;
      }
      const d = await getDiagram(diagramId);
      if (cancelled) return;
      if (!d) {
        setError('Diagram not found.');
        return;
      }
      setDiagram(d);
      setRun(null);
      try {
        const { graph: g } = await parseBpmnXml(d.xml);
        const { config: c } = await loadSyncedConfig(d);
        if (cancelled) return;
        setGraph(g);
        setConfig(c);
        setError(null);
        setHistory(await listRuns(d.id));
      } catch (err) {
        setError(`The model could not be read: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [diagramId, navigate]);

  const onConfigChange = useCallback(
    (c: SimulationConfig) => {
      setConfig(c);
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        if (diagram) saveSimConfig(diagram.id, c).catch(() => undefined);
      }, 400);
    },
    [diagram]
  );

  const support = useMemo(() => (graph && config ? checkPerformanceSupport(graph, config) : null), [graph, config]);
  const blocking = support?.findings.filter((f) => f.level === 'blocking') ?? [];

  const start = async () => {
    if (!diagram || !config) return;
    await saveSimConfig(diagram.id, config);
    setProgress({ done: 0, total: config.replications });
    setRun(null);
    const h = runSimulation(diagram.xml, config, { modelId: diagram.id, modelName: diagram.name, modelVersion: diagram.version }, (done, total) => setProgress({ done, total }));
    handle.current = h;
    try {
      const r = await h.promise;
      setRun(r);
      const summary = toRunSummary(r, diagram);
      await saveRun(summary);
      setHistory(await listRuns(diagram.id));
      recordExperiment();
      notify('Simulation finished', { kind: 'success', message: `${r.replicationCount} replication(s) in ${(r.durationMs / 1000).toFixed(1)} s` });
    } catch (err) {
      if (err instanceof SimulationError && err.message === 'Simulation cancelled.') notify('Simulation cancelled');
      else notify('Simulation failed', { kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setProgress(null);
      handle.current = null;
    }
  };

  if (!diagramId && diagrams.length === 0) {
    return (
      <div className="page">
        <div className="page-header page-narrow">
          <div>
            <div className="eyebrow">Performance lab · discrete-event simulation</div>
            <h1>Performance lab</h1>
          </div>
        </div>
        <div className="page-narrow card">
          <EmptyState icon={<FlaskConical size={32} />} title="No model to simulate yet">
            <p>Create a model in the modeler or open a simulation-ready example from the library.</p>
            <Link className="btn btn-primary" to="/library">
              Open the library
            </Link>
          </EmptyState>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="eyebrow">Performance lab · discrete-event simulation</div>
          <h1 className="row" style={{ gap: 10 }}>
            <select className="select" style={{ fontSize: 18, fontWeight: 650, height: 40 }} value={diagramId ?? ''} onChange={(e) => navigate(`/simulate/${e.target.value}`)} aria-label="Model">
              {diagrams.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {diagram?.role && <span className={`badge ${diagram.role === 'as-is' ? 'badge-primary' : 'badge-accent'}`}>{diagram.role.toUpperCase()}</span>}
          </h1>
          <p>Configure workload, resources and durations, then run independent replications. Results are reproducible: the same seed and configuration always yield the same numbers.</p>
        </div>
        <div className="row">
          {diagram && (
            <Link className="btn" to={`/modeler/${diagram.id}`}>
              <PenTool size={15} /> Edit model
            </Link>
          )}
          {diagram && (
            <Link className="btn" to={`/compare?asIs=${diagram.role === 'to-be' ? diagram.baseDiagramId ?? '' : diagram.id}`}>
              <Scale size={15} /> Compare
            </Link>
          )}
          {progress ? (
            <button className="btn btn-danger" onClick={() => handle.current?.cancel()}>
              <Square size={15} /> Cancel
            </button>
          ) : (
            <button className="btn btn-primary" onClick={start} disabled={!config || blocking.length > 0} title={blocking.length ? 'Fix the blocking problems first' : 'Run the simulation'}>
              <Play size={15} /> Run simulation
            </button>
          )}
        </div>
      </div>

      {error && <div className="callout callout-error" style={{ marginBottom: 16 }}>{error}</div>}

      {graph && config && (
        <div className="lab-layout">
          <aside className="card" style={{ padding: 16 }}>
            <ConfigEditor config={config} graph={graph} onChange={onConfigChange} />
          </aside>
          <div className="stack">
            {blocking.length > 0 && (
              <div className="callout callout-error">
                <AlertOctagon size={18} color="var(--error)" />
                <div>
                  <strong>The simulation cannot run:</strong>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                    {blocking.map((b, i) => (
                      <li key={i}>{b.message}</li>
                    ))}
                  </ul>
                  BPMN Studio refuses to simulate rather than produce misleading results.
                </div>
              </div>
            )}
            {progress && (
              <div className="card">
                <div className="row" style={{ marginBottom: 8 }}>
                  <Loader2 size={16} className="spin" /> Running replication {Math.min(progress.done + 1, progress.total)} of {progress.total}…
                </div>
                <ProgressBar value={progress.done / Math.max(1, progress.total)} label="Simulation progress" />
              </div>
            )}
            {run ? (
              <Dashboard run={run} graph={graph} xml={diagram!.xml} />
            ) : (
              !progress && (
                <div className="card">
                  <EmptyState icon={<FlaskConical size={32} />} title="No results yet">
                    <p>Review the parameters on the left and press “Run simulation”.</p>
                    {support && support.findings.length > 0 && (
                      <div style={{ textAlign: 'left', maxWidth: 640, margin: '12px auto 0' }}>
                        <strong>Simulation assumptions for this model</strong>
                        <ul style={{ paddingLeft: 18 }}>
                          {support.findings.map((f, i) => (
                            <li key={i} className="subtle" style={{ color: 'var(--text-muted)' }}>
                              <span className={`badge ${f.level === 'blocking' ? 'badge-error' : f.level === 'approximation' ? 'badge-warning' : 'badge-info'}`}>{f.level}</span> {f.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </EmptyState>
                </div>
              )
            )}
            {history.length > 0 && (
              <div className="card">
                <h3 className="row" style={{ gap: 6 }}>
                  <History size={16} /> Previous runs of this model
                </h3>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>When</th>
                        <th className="num">Model v.</th>
                        <th className="num">Seed</th>
                        <th className="num">Reps</th>
                        <th className="num">Cycle time</th>
                        <th className="num">Waiting</th>
                        <th className="num">Throughput / h</th>
                        <th className="num">SLA</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {history.slice(0, 10).map((h) => (
                        <tr key={h.runId}>
                          <td>{new Date(h.createdAt).toLocaleString()}</td>
                          <td className="num">{h.modelVersion}</td>
                          <td className="num mono">{h.seed}</td>
                          <td className="num">{h.replicationCount}</td>
                          <td className="num">{formatDuration(h.kpis.cycleTime.mean)}</td>
                          <td className="num">{formatDuration(h.kpis.waitingTime.mean)}</td>
                          <td className="num">{round(h.kpis.throughputPerHour.mean, 2)}</td>
                          <td className="num">{formatPercent(h.kpis.slaCompliance.mean)}</td>
                          <td>
                            <button
                              className="btn btn-sm btn-ghost btn-icon"
                              aria-label="Delete run"
                              onClick={async () => {
                                await deleteRun(h.runId);
                                setHistory(await listRuns(diagram!.id));
                              }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
