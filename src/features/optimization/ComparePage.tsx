import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, CopyPlus, Loader2, Minus, PenTool, Play, Scale, ShieldCheck, HelpCircle } from 'lucide-react';
import { BarChart, Bar, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList } from 'recharts';
import { listDiagrams, getDiagram, duplicateDiagram, saveRun, type StoredDiagram } from '../../storage/db';
import { loadSyncedConfig } from '../../services/diagrams';
import { parseBpmnXml } from '../../domain/bpmn/parse';
import type { SimulationConfig } from '../../domain/simulation/config';
import { experimentConditionDifferences } from '../../domain/simulation/config';
import type { SimulationRun } from '../../domain/simulation/experiment';
import { compareRuns, costBenefit, type MetricComparison } from '../../domain/simulation/compare';
import { analyseModel } from '../../domain/bpmn/behavior';
import { histogram } from '../../domain/simulation/stats';
import { runSimulation } from '../performance-simulation/simClient';
import { toRunSummary } from '../performance-simulation/SimulationPage';
import { DistributionCompareChart, PairedBarChart } from '../analytics/charts';
import { useChartTheme } from '../analytics/chartTheme';
import { useProgress } from '../../app/progress';
import { useToast } from '../../app/toast';
import { Callout, ProgressBar } from '../../components/ui';
import { formatDuration, formatMoney, formatPercent, round } from '../../utils/duration';

const HARMONIZED_KEYS: Array<keyof SimulationConfig> = ['arrival', 'numberOfCases', 'replications', 'seed', 'warmUp', 'sla', 'costs', 'priorities', 'calendarOffset', 'maxSimulationTime'];

function fmt(m: Pick<MetricComparison, 'unit'>, v: number) {
  switch (m.unit) {
    case 'duration':
      return formatDuration(v);
    case 'money':
      return formatMoney(v);
    case 'percent':
      return formatPercent(v);
    case 'rate':
      return round(v, 2);
    default:
      return round(v, 2);
  }
}

export default function ComparePage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const notify = useToast();
  const { recordExperiment } = useProgress();
  const [diagrams, setDiagrams] = useState<StoredDiagram[]>([]);
  const asIsId = params.get('asIs') ?? '';
  const toBeId = params.get('toBe') ?? '';
  const [configs, setConfigs] = useState<{ asIs?: SimulationConfig; toBe?: SimulationConfig }>({});
  const [harmonize, setHarmonize] = useState(true);
  const [runs, setRuns] = useState<{ asIs: SimulationRun; toBe: SimulationRun } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [soundness, setSoundness] = useState<{ asIs: boolean | null; toBe: boolean | null }>({ asIs: null, toBe: null });
  const [volume, setVolume] = useState<number | null>(null);
  const [investment, setInvestment] = useState(20000);

  useEffect(() => {
    listDiagrams().then(setDiagrams);
  }, []);

  // default selection: pair partner
  useEffect(() => {
    if (!diagrams.length) return;
    const next = new URLSearchParams(params);
    let changed = false;
    if (!asIsId) {
      const a = diagrams.find((d) => d.role === 'as-is') ?? diagrams[0];
      next.set('asIs', a.id);
      changed = true;
    }
    const currentAsIs = diagrams.find((d) => d.id === (next.get('asIs') ?? ''));
    if (!toBeId && currentAsIs) {
      const partner = diagrams.find((d) => d.id !== currentAsIs.id && ((currentAsIs.pairId && d.pairId === currentAsIs.pairId) || d.baseDiagramId === currentAsIs.id));
      if (partner) {
        next.set('toBe', partner.id);
        changed = true;
      }
    }
    if (changed) setParams(next, { replace: true });
  }, [diagrams, asIsId, toBeId, params, setParams]);

  useEffect(() => {
    let cancelled = false;
    setRuns(null);
    (async () => {
      const [a, b] = await Promise.all([asIsId ? getDiagram(asIsId) : undefined, toBeId ? getDiagram(toBeId) : undefined]);
      const ca = a ? (await loadSyncedConfig(a)).config : undefined;
      const cb = b ? (await loadSyncedConfig(b)).config : undefined;
      const sa = a ? analyseModel((await parseBpmnXml(a.xml)).graph).sound : null;
      const sb = b ? analyseModel((await parseBpmnXml(b.xml)).graph).sound : null;
      if (cancelled) return;
      setConfigs({ asIs: ca, toBe: cb });
      setSoundness({ asIs: sa, toBe: sb });
      if (ca && volume === null) {
        const perHour = ca.arrival.kind === 'distribution' ? 60 / Math.max(0.01, ca.arrival.interval) : 60 / Math.max(0.01, ca.arrival.interval);
        setVolume(Math.round(perHour * 8 * 250));
      }
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asIsId, toBeId]);

  const asIs = diagrams.find((d) => d.id === asIsId);
  const toBe = diagrams.find((d) => d.id === toBeId);
  const differences = useMemo(() => (configs.asIs && configs.toBe ? experimentConditionDifferences(configs.asIs, configs.toBe) : []), [configs]);

  const effectiveToBeConfig = (): SimulationConfig | undefined => {
    if (!configs.toBe) return undefined;
    if (!harmonize || !configs.asIs) return configs.toBe;
    const c = structuredClone(configs.toBe) as unknown as Record<string, unknown>;
    for (const k of HARMONIZED_KEYS) c[k] = structuredClone((configs.asIs as unknown as Record<string, unknown>)[k]);
    return c as unknown as SimulationConfig;
  };

  const runBoth = async () => {
    if (!asIs || !toBe || !configs.asIs) return;
    const toBeConfig = effectiveToBeConfig()!;
    try {
      setProgress('Simulating AS-IS…');
      const a = await runSimulation(asIs.xml, configs.asIs, { modelId: asIs.id, modelName: asIs.name, modelVersion: asIs.version }, (d, t) => setProgress(`Simulating AS-IS: replication ${d} of ${t}`)).promise;
      setProgress('Simulating TO-BE…');
      const b = await runSimulation(toBe.xml, toBeConfig, { modelId: toBe.id, modelName: toBe.name, modelVersion: toBe.version }, (d, t) => setProgress(`Simulating TO-BE: replication ${d} of ${t}`)).promise;
      setRuns({ asIs: a, toBe: b });
      await saveRun(toRunSummary(a, asIs));
      await saveRun(toRunSummary(b, toBe));
      recordExperiment();
    } catch (err) {
      notify('Comparison failed', { kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setProgress(null);
    }
  };

  const createToBe = async () => {
    if (!asIs) return;
    const copy = await duplicateDiagram(asIs.id, { asToBe: true });
    notify('TO-BE copy created', { kind: 'success', message: 'Redesign it in the modeler, then come back to compare.' });
    navigate(`/modeler/${copy.id}`);
  };

  const cmp = useMemo(() => (runs ? compareRuns(runs.asIs, runs.toBe) : null), [runs]);

  return (
    <div className="page">
      <div className="page-narrow" style={{ maxWidth: 1280 }}>
        <div className="page-header">
          <div>
            <div className="eyebrow">Process optimization</div>
            <h1>AS-IS vs TO-BE</h1>
            <p>Evaluate a redesign quantitatively: both alternatives are simulated under the same workload and random inputs, and the differences are reported with confidence intervals.</p>
          </div>
        </div>

        <div className="card stack" style={{ marginBottom: 20 }}>
          <div className="grid-2">
            <DiagramPicker label="AS-IS (current process)" value={asIsId} diagrams={diagrams} onChange={(id) => setParams({ asIs: id, ...(toBeId && toBeId !== id ? { toBe: toBeId } : {}) })} />
            <DiagramPicker label="TO-BE (redesign)" value={toBeId} diagrams={diagrams.filter((d) => d.id !== asIsId)} onChange={(id) => setParams({ asIs: asIsId, toBe: id })} />
          </div>
          <div className="row">
            {asIs && (
              <button className="btn" onClick={createToBe}>
                <CopyPlus size={15} /> Create a TO-BE copy of “{asIs.name}”
              </button>
            )}
            {asIs && (
              <Link className="btn btn-ghost" to={`/modeler/${asIs.id}`}>
                <PenTool size={15} /> Edit AS-IS
              </Link>
            )}
            {toBe && (
              <Link className="btn btn-ghost" to={`/modeler/${toBe.id}`}>
                <PenTool size={15} /> Edit TO-BE
              </Link>
            )}
            <span className="spacer" />
            <button className="btn btn-primary" disabled={!asIs || !toBe || !!progress} onClick={runBoth}>
              {progress ? <Loader2 size={15} className="spin" /> : <Play size={15} />} Run comparison
            </button>
          </div>
          {progress && (
            <div>
              <div className="subtle" style={{ marginBottom: 4 }}>
                {progress}
              </div>
              <ProgressBar value={progress.includes('TO-BE') ? 0.75 : 0.25} label="Comparison progress" />
            </div>
          )}
          {asIs && toBe && (
            <div className="stack" style={{ gap: 8 }}>
              <h3 style={{ margin: 0 }}>Experimental conditions</h3>
              {differences.length === 0 ? (
                <Callout kind="success" title="Equivalent assumptions">
                  Both alternatives use the same workload, seed, replications, warm-up, SLA and cost rates. Identical seeds give common random numbers: the same cases arrive at the same times, and shared activities receive the same random durations.
                </Callout>
              ) : (
                <Callout kind="warning" title="The configurations differ in their experimental conditions">
                  <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                    {differences.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                  <label className="checkbox">
                    <input type="checkbox" checked={harmonize} onChange={(e) => setHarmonize(e.target.checked)} />
                    Use the AS-IS workload and experiment settings for the TO-BE run (recommended). Resources, durations and routing of the TO-BE stay as configured.
                  </label>
                </Callout>
              )}
              {(soundness.asIs === false || soundness.toBe === false) && (
                <Callout kind="error" title="Behavioral problems">
                  {soundness.asIs === false && 'The AS-IS model is not sound. '}
                  {soundness.toBe === false && 'The TO-BE model is not sound (deadlock, missing synchronization or unreachable elements). '}
                  Check the Issues panel in the modeler — a redesign that introduces control-flow errors cannot be evaluated fairly.
                </Callout>
              )}
            </div>
          )}
        </div>

        {cmp && runs && asIs && toBe && (
          <Results cmp={cmp} runs={runs} labels={[asIs.name, toBe.name]} volume={volume ?? 0} setVolume={setVolume} investment={investment} setInvestment={setInvestment} toBeSound={soundness.toBe} />
        )}
        {!cmp && !progress && (
          <div className="card">
            <div className="empty">
              <Scale size={32} />
              <h3>Run the comparison to see the results</h3>
              <p className="muted">Workflow: model the AS-IS → configure workload and resources → duplicate as TO-BE → redesign → compare.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DiagramPicker({ label, value, diagrams, onChange }: { label: string; value: string; diagrams: StoredDiagram[]; onChange: (id: string) => void }) {
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <label>{label}</label>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a diagram…</option>
        {diagrams.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
            {d.role && !d.name.toUpperCase().includes(d.role.toUpperCase()) ? ` · ${d.role.toUpperCase()}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

function Results({
  cmp,
  runs,
  labels,
  volume,
  setVolume,
  investment,
  setInvestment,
  toBeSound
}: {
  cmp: ReturnType<typeof compareRuns>;
  runs: { asIs: SimulationRun; toBe: SimulationRun };
  labels: [string, string];
  volume: number;
  setVolume: (v: number) => void;
  investment: number;
  setInvestment: (v: number) => void;
  toBeSound: boolean | null;
}) {
  const t = useChartTheme();
  const cost = cmp.metrics.find((m) => m.id === 'cost');
  const cb = cost ? costBenefit(cost.asIs, cost.toBe, volume, investment) : null;
  const shortLabels: [string, string] = ['AS-IS', 'TO-BE'];

  const activityData = useMemo(() => {
    const names = new Map<string, { name: string; a: number; b: number }>();
    for (const a of Object.values(runs.asIs.activities)) names.set(a.name, { name: a.name, a: a.waiting.mean || 0, b: 0 });
    for (const b of Object.values(runs.toBe.activities)) {
      const e = names.get(b.name) ?? { name: b.name, a: 0, b: 0 };
      e.b = b.waiting.mean || 0;
      names.set(b.name, e);
    }
    return [...names.values()].filter((x) => x.a > 0.01 || x.b > 0.01).sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b));
  }, [runs]);

  const utilData = useMemo(() => {
    const names = new Map<string, { name: string; a: number; b: number }>();
    for (const p of Object.values(runs.asIs.pools)) names.set(p.name, { name: p.name, a: p.utilization.mean, b: 0 });
    for (const p of Object.values(runs.toBe.pools)) {
      const e = names.get(p.name) ?? { name: p.name, a: 0, b: 0 };
      e.b = p.utilization.mean;
      names.set(p.name, e);
    }
    return [...names.values()];
  }, [runs]);

  const distData = useMemo(() => {
    const a = runs.asIs.replications.flatMap((r) => r.samples.cycleTimes);
    const b = runs.toBe.replications.flatMap((r) => r.samples.cycleTimes);
    if (!a.length || !b.length) return [];
    const lo = Math.min(...a, ...b);
    const hi = Math.max(...a, ...b);
    const ha = histogram(a, 28, [lo, hi]);
    const hb = histogram(b, 28, [lo, hi]);
    return ha.map((bin, i) => ({ x: bin.from, a: bin.count / a.length, b: hb[i].count / b.length }));
  }, [runs]);

  const relData = cmp.metrics.filter((m) => Number.isFinite(m.improvement)).map((m) => ({ name: m.label, value: m.improvement, significant: m.significant }));
  const relLo = Math.min(0, Math.floor(Math.min(...relData.map((d) => d.value), 0) * 10) / 10);
  const relHi = Math.max(0.1, Math.ceil(Math.max(...relData.map((d) => d.value), 0) * 10) / 10);
  const relDomain: [number, number] = [relLo, relHi];
  const relStep = relHi - relLo > 1 ? 0.25 : 0.1;
  const relTicks: number[] = [];
  for (let v = relLo; v <= relHi + 1e-9; v += relStep) relTicks.push(Math.round(v * 100) / 100);
  const worse = cmp.metrics.filter((m) => m.improvement < -0.02 && m.significant !== false);
  const ct = cmp.metrics.find((m) => m.id === 'cycleTime');
  const sla = cmp.metrics.find((m) => m.id === 'sla');
  const rework = cmp.metrics.find((m) => m.id === 'rework');
  const tp = cmp.metrics.find((m) => m.id === 'throughput');
  const overloaded = Object.values(runs.toBe.pools).filter((p) => p.utilization.mean > 0.85);

  return (
    <div className="stack">
      <div className="card">
        <div className="card-title">
          <h3>Comparison of key metrics</h3>
          <span className="subtle">
            {cmp.paired ? `Paired comparison of ${runs.asIs.replicationCount} replications with common random numbers` : 'Independent runs (Welch confidence intervals)'}
          </span>
        </div>
        <div className="table-wrap">
          <table className="table compare-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="num" title={labels[0]}>AS-IS</th>
                <th className="num" title={labels[1]}>TO-BE</th>
                <th className="num">Difference (95% CI)</th>
                <th className="num">Improvement</th>
                <th>Assessment</th>
              </tr>
            </thead>
            <tbody>
              {cmp.metrics.map((m) => {
                const good = m.improvement > 0.005;
                const bad = m.improvement < -0.005;
                return (
                  <tr key={m.id}>
                    <td>{m.label}</td>
                    <td className="num">
                      {fmt(m, m.asIs)} {Number.isFinite(m.asIsCi) && <span className="ci">±{fmt(m, m.asIsCi)}</span>}
                    </td>
                    <td className="num">
                      {fmt(m, m.toBe)} {Number.isFinite(m.toBeCi) && <span className="ci">±{fmt(m, m.toBeCi)}</span>}
                    </td>
                    <td className="num">
                      {m.difference >= 0 ? '+' : '−'}
                      {fmt(m, Math.abs(m.difference))} {Number.isFinite(m.differenceCi) && <span className="ci">±{fmt(m, m.differenceCi)}</span>}
                    </td>
                    <td className={`num ${good ? 'better' : bad ? 'worse' : ''}`}>
                      <span className="row" style={{ gap: 2, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        {good ? <ArrowUpRight size={14} /> : bad ? <ArrowDownRight size={14} /> : <Minus size={14} />}
                        {Number.isFinite(m.improvement) ? formatPercent(m.improvement) : '—'}
                      </span>
                    </td>
                    <td className="subtle">
                      {m.significant === null ? 'no CI (1 replication)' : m.significant ? (good ? 'significant improvement' : bad ? 'significant deterioration' : 'significant') : 'not significant'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="subtle" style={{ marginTop: 8, marginBottom: 0 }}>
          Improvement is measured in the “better” direction of each metric (shorter times, lower costs, higher throughput and SLA compliance). A difference is significant when its 95% confidence interval excludes zero.
        </p>
      </div>

      <div className="grid-2">
        <figure className="card chart-card" style={{ margin: 0 }}>
          <figcaption style={{ marginBottom: 10 }}>
            <strong>Relative improvement vs. AS-IS</strong>
            <div className="subtle">Positive = better; labels show the change</div>
          </figcaption>
          <div style={{ width: '100%', height: Math.max(200, relData.length * 30 + 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={relData} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }} barCategoryGap={6}>
                <CartesianGrid horizontal={false} stroke={t.grid} />
                <XAxis type="number" domain={relDomain} ticks={relTicks} stroke={t.axis} tick={{ fill: t.muted, fontSize: 11 }} tickLine={false} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                <YAxis type="category" dataKey="name" width={170} stroke={t.axis} tick={{ fill: t.textMuted, fontSize: 12 }} tickLine={false} />
                <ReferenceLine x={0} stroke={t.muted} />
                <Tooltip
                  cursor={{ fill: t.grid, opacity: 0.4 }}
                  formatter={(v) => [formatPercent(Number(v)), 'Improvement']}
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }}
                />
                <Bar dataKey="value" maxBarSize={18} radius={4}>
                  {relData.map((d) => (
                    <Cell key={d.name} fill={d.value >= 0 ? t.series[0] : '#e34948'} />
                  ))}
                  <LabelList dataKey="value" position="right" formatter={(v: unknown) => formatPercent(Number(v), 0)} style={{ fill: t.textMuted, fontSize: 11 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </figure>
        {distData.length > 0 && <DistributionCompareChart title="Cycle time distribution" data={distData} labels={shortLabels} />}
      </div>

      <div className="grid-2">
        <div className="card">
          <h3>Bottleneck changes</h3>
          {cmp.bottleneck.asIs ? (
            <p>
              AS-IS: cases wait longest before <strong>{cmp.bottleneck.asIs.name}</strong> ({formatDuration(cmp.bottleneck.asIs.waiting)}).
            </p>
          ) : (
            <p className="muted">AS-IS has no significant waiting.</p>
          )}
          {cmp.bottleneck.toBe ? (
            <p>
              TO-BE: the longest wait is before <strong>{cmp.bottleneck.toBe.name}</strong> ({formatDuration(cmp.bottleneck.toBe.waiting)}).
            </p>
          ) : (
            <p className="muted">TO-BE has no significant waiting.</p>
          )}
          {cmp.bottleneck.moved && (
            <Callout kind="info" title="The bottleneck moved">
              Relieving one constraint often exposes the next one — improvement efforts should now focus on “{cmp.bottleneck.toBe?.name}”.
            </Callout>
          )}
          {cmp.maxUtilization.asIs && cmp.maxUtilization.toBe && (
            <p className="subtle">
              Highest utilization: {cmp.maxUtilization.asIs.name} {formatPercent(cmp.maxUtilization.asIs.value)} (AS-IS) → {cmp.maxUtilization.toBe.name} {formatPercent(cmp.maxUtilization.toBe.value)} (TO-BE)
            </p>
          )}
        </div>
        <div className="card">
          <h3>Cost-benefit analysis</h3>
          <div className="field-row">
            <div className="field">
              <label htmlFor="cb-volume">Cases per year</label>
              <input id="cb-volume" className="input input-sm" type="number" min={0} value={volume} onChange={(e) => setVolume(Math.max(0, Number(e.target.value)))} />
              <span className="hint">default: arrival rate × 8 h × 250 days</span>
            </div>
            <div className="field">
              <label htmlFor="cb-invest">One-time investment (€)</label>
              <input id="cb-invest" className="input input-sm" type="number" min={0} value={investment} onChange={(e) => setInvestment(Math.max(0, Number(e.target.value)))} />
              <span className="hint">e.g. automation, training</span>
            </div>
          </div>
          {cb && (
            <table className="table">
              <tbody>
                <tr>
                  <td>Annual process cost AS-IS</td>
                  <td className="num">{formatMoney(cb.annualAsIs, 0)}</td>
                </tr>
                <tr>
                  <td>Annual process cost TO-BE</td>
                  <td className="num">{formatMoney(cb.annualToBe, 0)}</td>
                </tr>
                <tr>
                  <td>
                    <strong>Annual saving</strong>
                  </td>
                  <td className={`num ${cb.annualSaving >= 0 ? 'delta-good' : 'delta-bad'}`}>{formatMoney(cb.annualSaving, 0)}</td>
                </tr>
                <tr>
                  <td>Payback period</td>
                  <td className="num">{Number.isFinite(cb.paybackMonths) ? `${round(cb.paybackMonths, 1)} months` : 'never (no saving)'}</td>
                </tr>
                <tr>
                  <td>Net benefit after 3 years</td>
                  <td className="num">{formatMoney(cb.threeYearNet, 0)}</td>
                </tr>
              </tbody>
            </table>
          )}
          <p className="subtle" style={{ marginBottom: 0 }}>Process cost includes labor while working, fixed activity costs and waiting costs, as configured. Non-monetary effects (customer satisfaction, risk) are not included.</p>
        </div>
      </div>

      <div className="grid-2">
        {activityData.length > 0 && <PairedBarChart title="Waiting time per activity" subtitle="Average minutes before the activity starts" data={activityData} labels={shortLabels} format={(v) => round(v, 1)} />}
        {utilData.length > 0 && <PairedBarChart title="Resource utilization" subtitle="Share of scheduled time spent working" data={utilData} labels={shortLabels} format={(v) => formatPercent(v, 0)} />}
      </div>

      <div className="card">
        <h3 className="row" style={{ gap: 6 }}>
          <HelpCircle size={16} /> Interpret the results
        </h3>
        <p className="muted">Answer each question for yourself first, then compare with what the data says.</p>
        <Question q="Did the redesign improve cycle time?">
          {ct ? (
            <>
              Average cycle time changed from {formatDuration(ct.asIs)} to {formatDuration(ct.toBe)} ({formatPercent(ct.improvement)} improvement), which is {ct.significant ? 'statistically significant' : ct.significant === null ? 'not tested (single replication)' : 'not statistically significant — the difference could be random noise'}.
            </>
          ) : (
            'No data.'
          )}
        </Question>
        <Question q="Did the bottleneck move elsewhere?">
          {cmp.bottleneck.moved ? `Yes: from “${cmp.bottleneck.asIs?.name}” to “${cmp.bottleneck.toBe?.name}”.` : cmp.bottleneck.asIs ? `No, the longest waiting time is still before “${cmp.bottleneck.toBe?.name ?? cmp.bottleneck.asIs.name}”.` : 'Neither alternative has a pronounced bottleneck.'}
        </Question>
        <Question q="Was the improvement economically justified?">
          {cb ? (cb.annualSaving > 0 ? `The TO-BE saves ${formatMoney(cb.annualSaving, 0)} per year; the investment of ${formatMoney(investment, 0)} pays back after ${round(cb.paybackMonths, 1)} months.` : `The TO-BE does not reduce process cost (${formatMoney(-cb.annualSaving, 0)} more per year). It can still be justified by faster service — weigh the cycle-time gain against the cost.`) : 'No cost data.'}
        </Question>
        <Question q="Did resource utilization become excessive?">
          {overloaded.length ? `Yes: ${overloaded.map((p) => `${p.name} (${formatPercent(p.utilization.mean, 0)})`).join(', ')} exceed 85%. Such high utilization makes the process sensitive to workload peaks.` : 'No resource pool exceeds 85% utilization in the TO-BE.'}
        </Question>
        <Question q="Did increased throughput affect process quality?">
          {tp ? `Throughput changed by ${formatPercent(tp.improvement)}. ` : ''}
          {rework ? `The rework rate changed from ${formatPercent(rework.asIs)} to ${formatPercent(rework.toBe)}. ` : ''}
          {sla ? `SLA compliance changed from ${formatPercent(sla.asIs)} to ${formatPercent(sla.toBe)}. ` : ''}
          Quality aspects that the model does not contain (e.g. errors of an automated check) must be judged qualitatively.
        </Question>
        <Question q="Were unintended consequences introduced?">
          {worse.length ? `These metrics got worse: ${worse.map((m) => m.label.toLowerCase()).join(', ')}. ` : 'No metric deteriorated significantly. '}
          {toBeSound === false ? 'The TO-BE model has control-flow problems — check the validator.' : toBeSound ? 'The TO-BE model is sound (verified by the formal control-flow analysis).' : ''}
        </Question>
      </div>
      <div className="row subtle">
        <ShieldCheck size={14} /> Seed {runs.asIs.seed}
        {runs.toBe.seed !== runs.asIs.seed ? ` / ${runs.toBe.seed}` : ''} · {runs.asIs.replicationCount} replications · {runs.asIs.config.numberOfCases} cases each.
        {cmp.conditionDifferences.length > 0 && (
          <span className="row" style={{ gap: 4, color: 'var(--warning)' }}>
            <AlertTriangle size={14} /> Conditions differ — see the disclosure above.
          </span>
        )}
        {cmp.conditionDifferences.length === 0 && (
          <span className="row" style={{ gap: 4 }}>
            <CheckCircle2 size={14} color="var(--success)" /> Equivalent assumptions.
          </span>
        )}
      </div>
    </div>
  );
}

function Question({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '10px 0' }}>
      <div className="row">
        <strong style={{ flex: 1 }}>{q}</strong>
        <button className="btn btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide' : 'What does the data say?'}
        </button>
      </div>
      {open && <p style={{ margin: '6px 0 0' }}>{children}</p>}
    </div>
  );
}
