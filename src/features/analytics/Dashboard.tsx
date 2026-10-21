import { useMemo, useState } from 'react';
import { AlertTriangle, Download, Gauge, Info, Lightbulb, TrendingUp } from 'lucide-react';
import type { SimulationRun } from '../../domain/simulation/experiment';
import type { ProcessGraph } from '../../domain/bpmn/graph';
import { displayName } from '../../domain/bpmn/graph';
import { histogram } from '../../domain/simulation/stats';
import { describeDistribution } from '../../domain/simulation/distributions';
import { eventLogToCsv, eventLogToJson, eventLogToXes } from '../../domain/simulation/eventLog';
import { serializeRun } from '../../domain/simulation/experiment';
import { formatDuration, formatMoney, formatPercent, round } from '../../utils/duration';
import { Tabs, downloadText, safeFileName } from '../../components/ui';
import { BpmnViewer } from '../../components/BpmnViewer';
import { ActivityTimeChart, HistogramChart, LineSeriesChart, PathChart, UtilizationChart } from './charts';
import { KpiTile } from './KpiTile';

type DashTab = 'overview' | 'activities' | 'resources' | 'distributions' | 'timeline' | 'paths' | 'replications' | 'log' | 'assumptions';

const HEAT = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'];

export function Dashboard({ run, graph, xml }: { run: SimulationRun; graph: ProcessGraph | null; xml: string }) {
  const [tab, setTab] = useState<DashTab>('overview');
  const rep0 = run.replications[0];
  const k = run.kpis;

  const activityData = useMemo(
    () =>
      Object.values(run.activities)
        .filter((a) => a.executions.mean > 0 || a.waiting.mean > 0)
        .map((a) => ({ id: a.id, name: a.name, processing: a.processing.mean || 0, waiting: a.waiting.mean || 0, executions: a.executions.mean, queue: a.queueLengthAvg.mean, cost: a.cost.mean }))
        .sort((x, y) => y.processing + y.waiting - (x.processing + x.waiting)),
    [run]
  );
  const bottleneck = activityData.reduce<(typeof activityData)[number] | null>((best, a) => (!best || a.waiting > best.waiting ? a : best), null);
  const pools = Object.values(run.pools);
  const busiestPool = pools.reduce<(typeof pools)[number] | null>((best, p) => (!best || p.utilization.mean > best.utilization.mean ? p : best), null);

  const insights = useMemo(() => buildInsights(run), [run]);

  const badges = useMemo(() => {
    const max = Math.max(1e-9, ...activityData.map((a) => a.waiting));
    return activityData.map((a) => {
      const level = Math.min(HEAT.length - 1, Math.floor((a.waiting / max) * (HEAT.length - 1) + 0.0001));
      const bg = HEAT[level];
      const ink = level >= 3 ? '#ffffff' : '#0b0b0b';
      return { id: a.id, html: `<span class="heat-badge" style="background:${bg};color:${ink}">wait ${formatDuration(a.waiting, 0)}</span>` };
    });
  }, [activityData]);

  const cycleHist = useMemo(() => toHist(rep0?.samples.cycleTimes ?? []), [rep0]);
  const waitHist = useMemo(() => toHist(rep0?.samples.waitingTimes ?? []), [rep0]);

  const tabs: Array<{ id: DashTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    { id: 'activities', label: 'Activities' },
    { id: 'resources', label: 'Resources' },
    { id: 'distributions', label: 'Distributions' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'paths', label: 'Paths' },
    { id: 'replications', label: 'Replications' },
    { id: 'log', label: 'Event log' },
    { id: 'assumptions', label: 'Assumptions' }
  ];

  const ci = (e: { ciHalfWidth: number }, f: (v: number) => string) => (Number.isFinite(e.ciHalfWidth) ? `95% CI ± ${f(e.ciHalfWidth)}` : 'single replication');
  const totals = run.replications.reduce((a, r) => ({ measured: a.measured + r.cases.measured, completed: a.completed + r.cases.completed, incomplete: a.incomplete + r.cases.incomplete, rejected: a.rejected + r.cases.rejected }), { measured: 0, completed: 0, incomplete: 0, rejected: 0 });

  return (
    <div className="stack">
      <Tabs label="Simulation results" tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <>
          <div className="kpi-grid">
            <KpiTile label="Avg. cycle time" value={formatDuration(k.cycleTime.mean)} sub={ci(k.cycleTime, (v) => formatDuration(v))} />
            <KpiTile label="90th percentile cycle time" value={formatDuration(k.cycleTimeP90.mean)} sub="9 of 10 cases are faster" />
            <KpiTile label="Avg. waiting time" value={formatDuration(k.waitingTime.mean)} sub={`${formatPercent(k.waitingTime.mean / (k.cycleTime.mean || 1), 0)} of cycle time`} />
            <KpiTile label="Avg. processing time" value={formatDuration(k.processingTime.mean)} sub="work content per case" />
            <KpiTile label="Throughput" value={`${round(k.throughputPerHour.mean, 2)} / h`} sub={ci(k.throughputPerHour, (v) => round(v, 2))} />
            <KpiTile label="Work in progress" value={round(k.wipAvg.mean, 1)} sub="avg. cases in the system" />
            {run.config.sla && (
              <KpiTile
                label={`SLA ≤ ${formatDuration(run.config.sla.cycleTimeTarget, 0)}`}
                value={formatPercent(k.slaCompliance.mean)}
                sub={ci(k.slaCompliance, (v) => formatPercent(v))}
                status={k.slaCompliance.mean >= 0.9 ? 'good' : k.slaCompliance.mean >= 0.7 ? 'warning' : 'critical'}
              />
            )}
            <KpiTile label="Cost per case" value={formatMoney(k.costPerCase.mean)} sub={ci(k.costPerCase, (v) => formatMoney(v))} />
            <KpiTile label="Rework" value={formatPercent(k.reworkRate.mean)} sub="cases with repeated work" />
            <KpiTile label="Cases" value={`${totals.completed}`} sub={`completed of ${totals.measured} measured${totals.incomplete ? ` · ${totals.incomplete} incomplete` : ''}${totals.rejected ? ` · ${totals.rejected} rejected` : ''}`} status={totals.incomplete ? 'critical' : undefined} />
          </div>

          {run.warnings.length > 0 && (
            <div className="callout callout-warning">
              <AlertTriangle size={18} color="var(--warning)" />
              <ul className="list-plain" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {run.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid-2">
            <div className="card">
              <h3 className="row" style={{ gap: 6 }}>
                <Gauge size={16} /> Bottleneck
              </h3>
              {bottleneck && bottleneck.waiting > 0.01 ? (
                <p style={{ margin: 0 }}>
                  Cases wait longest before <strong>{bottleneck.name}</strong>: {formatDuration(bottleneck.waiting)} on average (processing: {formatDuration(bottleneck.processing)}).
                  {busiestPool && (
                    <>
                      {' '}
                      The busiest resource pool is <strong>{busiestPool.name}</strong> at {formatPercent(busiestPool.utilization.mean)} utilization.
                    </>
                  )}
                </p>
              ) : (
                <p className="muted" style={{ margin: 0 }}>No activity has significant waiting time — resources are not a constraint in this scenario.</p>
              )}
            </div>
            <div className="card">
              <h3 className="row" style={{ gap: 6 }}>
                <Lightbulb size={16} /> Interpretation
              </h3>
              <ul className="stack" style={{ gap: 8, paddingLeft: 18, margin: 0 }}>
                {insights.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          </div>
          {graph && (
            <figure className="card" style={{ margin: 0 }}>
              <figcaption style={{ marginBottom: 8 }}>
                <strong>Waiting time on the process map</strong>
                <div className="subtle">Badges show the average waiting time before each activity; darker means longer.</div>
              </figcaption>
              <BpmnViewer xml={xml} height={300} badges={badges} ariaLabel="Diagram with average waiting time per activity" />
            </figure>
          )}
          {activityData.length > 0 && <ActivityTimeChart data={activityData} />}
        </>
      )}

      {tab === 'activities' && (
        <>
          {activityData.length > 0 && <ActivityTimeChart data={activityData} />}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Activity</th>
                  <th className="num">Executions</th>
                  <th className="num">Avg. processing</th>
                  <th className="num">Avg. waiting</th>
                  <th className="num">Avg. queue length</th>
                  <th className="num">Cost</th>
                  <th>Duration (input)</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(run.activities).map((a) => {
                  const cfg = run.config.activities[a.id];
                  return (
                    <tr key={a.id}>
                      <td>{a.name}</td>
                      <td className="num">{round(a.executions.mean, 1)}</td>
                      <td className="num">{formatDuration(a.processing.mean)}</td>
                      <td className="num">{formatDuration(a.waiting.mean)}</td>
                      <td className="num">{round(a.queueLengthAvg.mean, 2)}</td>
                      <td className="num">{formatMoney(a.cost.mean)}</td>
                      <td className="subtle">{cfg ? `${describeDistribution(cfg.duration)} min` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'resources' && (
        <>
          {pools.length > 0 && <UtilizationChart data={pools.map((p) => ({ name: `${p.name} (${p.capacity})`, utilization: p.utilization.mean, ci: p.utilization.ciHalfWidth }))} />}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Resource pool</th>
                  <th className="num">Workers</th>
                  <th className="num">Utilization</th>
                  <th className="num">Avg. queue</th>
                  <th className="num">Labor cost</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pools.map((p) => {
                  const u = p.utilization.mean;
                  const status = u > 0.95 ? ['critical', 'Overloaded'] : u > 0.85 ? ['serious', 'Very busy'] : u < 0.3 ? ['warning', 'Under-used'] : ['good', 'Balanced'];
                  return (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="num">{p.capacity}</td>
                      <td className="num">{formatPercent(u)}</td>
                      <td className="num">{round(p.queueLengthAvg.mean, 2)}</td>
                      <td className="num">{formatMoney(p.cost.mean)}</td>
                      <td>
                        <span className="row" style={{ gap: 6 }}>
                          <i style={{ width: 10, height: 10, borderRadius: '50%', background: `var(--status-${status[0]})`, display: 'inline-block' }} aria-hidden />
                          {status[1]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="subtle">
            Utilization = busy time ÷ scheduled time within the measurement window (after warm-up). Work that continues after a shift ends counts as overtime and is not included.
          </p>
        </>
      )}

      {tab === 'distributions' && (
        <div className="grid-2">
          <HistogramChart title="Cycle time distribution" subtitle={`Replication 1, ${rep0?.samples.cycleTimes.length ?? 0} completed cases`} data={cycleHist} />
          <HistogramChart title="Waiting time distribution" subtitle="Total waiting time per case, replication 1" data={waitHist} />
          <div className="card">
            <h3>Cycle time percentiles (replication 1)</h3>
            <table className="table">
              <tbody>
                {rep0 &&
                  (
                    [
                      ['Minimum', rep0.kpis.cycleTime.min],
                      ['Median', rep0.kpis.cycleTime.p50],
                      ['Mean', rep0.kpis.cycleTime.mean],
                      ['90th percentile', rep0.kpis.cycleTime.p90],
                      ['95th percentile', rep0.kpis.cycleTime.p95],
                      ['Maximum', rep0.kpis.cycleTime.max]
                    ] as Array<[string, number]>
                  ).map(([l, v]) => (
                    <tr key={l}>
                      <td>{l}</td>
                      <td className="num">{formatDuration(v)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'timeline' && rep0 && (
        <div className="grid-2">
          <LineSeriesChart title="Work in progress" subtitle="Cases in the system over simulated time (replication 1)" data={rep0.timeline.map((p) => ({ t: p.t, wip: p.wip }))} xKey="t" series={[{ key: 'wip', label: 'WIP', colorIndex: 0 }]} xFormat={(v) => formatDuration(v, 0)} yFormat={(v) => round(v, 0)} area />
          <LineSeriesChart title="Completed cases" subtitle="Cumulative case completions (replication 1)" data={rep0.timeline.map((p) => ({ t: p.t, completed: p.completed }))} xKey="t" series={[{ key: 'completed', label: 'Completed', colorIndex: 0 }]} xFormat={(v) => formatDuration(v, 0)} yFormat={(v) => round(v, 0)} />
          <div className="card" style={{ gridColumn: '1 / -1' }}>
            <p className="subtle" style={{ margin: 0 }}>
              Warm-up ends at {formatDuration(rep0.warmUpEnd)}; statistics are collected from then until {formatDuration(rep0.endTime)}. A steadily rising WIP curve indicates an unstable system (arrivals exceed capacity).
            </p>
          </div>
        </div>
      )}

      {tab === 'paths' && rep0 && (
        <>
          <PathChart
            data={rep0.paths.slice(0, 10).map((p, i) => ({ label: `#${i + 1}`, share: p.count / Math.max(1, rep0.cases.completed), count: p.count }))}
          />
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Activity sequence</th>
                  <th className="num">Cases</th>
                  <th className="num">Share</th>
                </tr>
              </thead>
              <tbody>
                {rep0.paths.slice(0, 15).map((p, i) => (
                  <tr key={i}>
                    <td>#{i + 1}</td>
                    <td>{p.path.join(' → ')}</td>
                    <td className="num">{p.count}</td>
                    <td className="num">{formatPercent(p.count / Math.max(1, rep0.cases.completed))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {graph && Object.keys(rep0.gatewayDecisions).length > 0 && (
            <div className="card">
              <h3>Gateway decisions (observed frequencies)</h3>
              <table className="table">
                <tbody>
                  {Object.entries(rep0.gatewayDecisions).map(([gid, flows]) => {
                    const total = Object.values(flows).reduce((a, b) => a + b, 0);
                    return Object.entries(flows).map(([fid, n]) => (
                      <tr key={`${gid}-${fid}`}>
                        <td>{displayName(graph, gid)}</td>
                        <td>{graph.flows[fid]?.name || `→ ${displayName(graph, graph.flows[fid]?.targetId ?? fid)}`}</td>
                        <td className="num">{n}</td>
                        <td className="num">{formatPercent(n / Math.max(1, total))}</td>
                        <td className="num subtle">configured {formatPercent(run.config.gateways[gid]?.probabilities[fid] ?? NaN)}</td>
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'replications' && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Replication</th>
                <th className="num">Completed</th>
                <th className="num">Avg. cycle time</th>
                <th className="num">Avg. waiting</th>
                <th className="num">Throughput / h</th>
                <th className="num">WIP</th>
                <th className="num">SLA</th>
                <th className="num">Cost / case</th>
                <th className="num">Events</th>
              </tr>
            </thead>
            <tbody>
              {run.replications.map((r) => (
                <tr key={r.replication}>
                  <td>{r.replication + 1}</td>
                  <td className="num">
                    {r.cases.completed}/{r.cases.measured}
                  </td>
                  <td className="num">{formatDuration(r.kpis.cycleTime.mean)}</td>
                  <td className="num">{formatDuration(r.kpis.waitingTime.mean)}</td>
                  <td className="num">{round(r.kpis.throughputPerHour, 2)}</td>
                  <td className="num">{round(r.kpis.wipAvg, 2)}</td>
                  <td className="num">{formatPercent(r.kpis.slaCompliance)}</td>
                  <td className="num">{formatMoney(r.kpis.costPerCase.mean)}</td>
                  <td className="num">{r.eventsProcessed.toLocaleString()}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Mean ± 95% CI</strong>
                </td>
                <td />
                <td className="num">
                  <strong>{formatDuration(k.cycleTime.mean)}</strong> <span className="ci">± {formatDuration(k.cycleTime.ciHalfWidth)}</span>
                </td>
                <td className="num">
                  <strong>{formatDuration(k.waitingTime.mean)}</strong> <span className="ci">± {formatDuration(k.waitingTime.ciHalfWidth)}</span>
                </td>
                <td className="num">
                  <strong>{round(k.throughputPerHour.mean, 2)}</strong> <span className="ci">± {round(k.throughputPerHour.ciHalfWidth, 2)}</span>
                </td>
                <td className="num">
                  <strong>{round(k.wipAvg.mean, 2)}</strong>
                </td>
                <td className="num">
                  <strong>{formatPercent(k.slaCompliance.mean)}</strong>
                </td>
                <td className="num">
                  <strong>{formatMoney(k.costPerCase.mean)}</strong>
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === 'log' && rep0 && (
        <>
          <div className="row">
            <p className="muted" style={{ margin: 0 }}>
              {rep0.eventLog.length.toLocaleString()} activity instances of replication 1 (warm-up included). Each row yields a start and a complete event in the exported log.
            </p>
            <span className="spacer" />
            <button
              className="btn btn-sm"
              onClick={() =>
                downloadText(`${safeFileName(run.modelName ?? 'process')}-${run.runId}.csv`, eventLogToCsv(rep0.eventLog, { modelName: run.modelName ?? 'Process', runId: run.runId, seed: run.seed, replication: 0, epoch: epochOf(run) }), 'text/csv')
              }
            >
              <Download size={14} /> CSV
            </button>
            <button
              className="btn btn-sm"
              onClick={() =>
                downloadText(`${safeFileName(run.modelName ?? 'process')}-${run.runId}.xes`, eventLogToXes(rep0.eventLog, { modelName: run.modelName ?? 'Process', runId: run.runId, seed: run.seed, replication: 0, epoch: epochOf(run) }), 'application/xml')
              }
            >
              <Download size={14} /> XES
            </button>
            <button
              className="btn btn-sm"
              onClick={() =>
                downloadText(
                  `${safeFileName(run.modelName ?? 'process')}-${run.runId}-log.json`,
                  JSON.stringify(eventLogToJson(rep0.eventLog, { modelName: run.modelName ?? 'Process', runId: run.runId, seed: run.seed, replication: 0, epoch: epochOf(run) }), null, 2),
                  'application/json'
                )
              }
            >
              <Download size={14} /> JSON
            </button>
            <button className="btn btn-sm" onClick={() => downloadText(`${safeFileName(run.modelName ?? 'process')}-${run.runId}.json`, JSON.stringify(serializeRun(run), null, 2), 'application/json')}>
              <Download size={14} /> Run (JSON)
            </button>
          </div>
          <div className="table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Case</th>
                  <th>Activity</th>
                  <th>Resource</th>
                  <th className="num">Ready</th>
                  <th className="num">Start</th>
                  <th className="num">End</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rep0.eventLog.slice(0, 300).map((e, i) => (
                  <tr key={i}>
                    <td>case-{e.caseId}</td>
                    <td>{e.activity}</td>
                    <td>{e.resource}</td>
                    <td className="num">{round(e.enqueued, 1)}</td>
                    <td className="num">{round(e.start, 1)}</td>
                    <td className="num">{round(e.end, 1)}</td>
                    <td>{e.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary>Simulation event trace (first {rep0.trace.length} events)</summary>
            <ol className="trace-list mono" style={{ maxHeight: 360 }}>
              {rep0.trace.map((t, i) => (
                <li key={i}>
                  t={round(t.t, 2)} {t.type}
                  {t.caseId !== undefined ? ` case-${t.caseId}` : ''} {t.elementId && graph ? displayName(graph, t.elementId) : t.elementId ?? ''} {t.detail ? `· ${t.detail}` : ''}
                </li>
              ))}
            </ol>
          </details>
        </>
      )}

      {tab === 'assumptions' && <Assumptions run={run} graph={graph} />}
    </div>
  );
}

function epochOf(run: SimulationRun) {
  // simulation time 0 = the configured calendar offset after Monday 00:00 of a reference week
  const monday = Date.UTC(2026, 0, 5, 0, 0, 0);
  return new Date(monday + run.config.calendarOffset * 60_000).toISOString();
}

function toHist(values: number[]) {
  if (!values.length) return [];
  const bins = Math.min(24, Math.max(6, Math.round(Math.sqrt(values.length))));
  return histogram(values, bins).map((b) => ({ label: formatDuration(b.from, 0), from: b.from, to: b.to, count: b.count }));
}

function buildInsights(run: SimulationRun): string[] {
  const out: string[] = [];
  const k = run.kpis;
  const waitShare = k.waitingTime.mean / (k.cycleTime.mean || 1);
  if (waitShare > 0.5) out.push(`Cases spend ${formatPercent(waitShare, 0)} of their cycle time waiting for resources. Capacity, scheduling or priorities — not the work itself — dominate the cycle time.`);
  else if (waitShare > 0.2) out.push(`Waiting accounts for ${formatPercent(waitShare, 0)} of the cycle time. Reducing it at the bottleneck is likely the most effective lever.`);
  else out.push(`Waiting is only ${formatPercent(waitShare, 0)} of the cycle time: to become faster, change the work itself (automation, parallelization, fewer steps).`);
  for (const p of Object.values(run.pools)) {
    if (p.utilization.mean > 0.9) out.push(`“${p.name}” is utilized ${formatPercent(p.utilization.mean, 0)}. Near 100%, small increases in workload cause very long queues (queueing theory: waiting grows like ρ/(1−ρ)).`);
    else if (p.utilization.mean < 0.3) out.push(`“${p.name}” is busy only ${formatPercent(p.utilization.mean, 0)} of the time — capacity could be reallocated.`);
  }
  if (run.config.sla && k.slaCompliance.mean < 0.9) out.push(`Only ${formatPercent(k.slaCompliance.mean, 0)} of the cases meet the SLA of ${formatDuration(run.config.sla.cycleTimeTarget, 0)}. Look at the 90th percentile (${formatDuration(k.cycleTimeP90.mean)}), not only at the mean.`);
  if (k.reworkRate.mean > 0.1) out.push(`${formatPercent(k.reworkRate.mean, 0)} of cases contain rework. Preventing errors upstream reduces both cycle time and cost.`);
  const rel = k.cycleTime.ciHalfWidth / (k.cycleTime.mean || 1);
  if (run.replicationCount > 1 && rel > 0.1) out.push(`The 95% confidence interval of the cycle time is ±${formatPercent(rel, 0)} of the mean. Increase the number of replications or cases for more precise comparisons.`);
  if (run.replicationCount > 1 && rel <= 0.1) out.push(`The estimates are reasonably precise (cycle time ±${formatPercent(rel, 0)} with ${run.replicationCount} replications).`);
  const lambda = k.throughputPerHour.mean / 60;
  if (lambda > 0 && k.cycleTime.mean > 0) {
    const little = lambda * k.cycleTime.mean;
    out.push(`Little’s law check: WIP ≈ throughput × cycle time = ${round(little, 2)} vs. measured ${round(k.wipAvg.mean, 2)}. Large deviations indicate a system that is not in steady state.`);
  }
  return out;
}

function Assumptions({ run, graph }: { run: SimulationRun; graph: ProcessGraph | null }) {
  const c = run.config;
  const name = (id: string) => (graph ? displayName(graph, id) : id);
  return (
    <div className="grid-2">
      <div className="card">
        <h3 className="row" style={{ gap: 6 }}>
          <Info size={16} /> Experimental design
        </h3>
        <table className="table">
          <tbody>
            <tr>
              <td>Random seed</td>
              <td className="mono">{c.seed}</td>
            </tr>
            <tr>
              <td>Replications</td>
              <td>{run.replicationCount} independent replications, 95% confidence intervals with Student’s t</td>
            </tr>
            <tr>
              <td>Cases per replication</td>
              <td>{c.numberOfCases}</td>
            </tr>
            <tr>
              <td>Warm-up</td>
              <td>{c.warmUp.kind === 'none' ? 'none' : c.warmUp.kind === 'cases' ? `first ${c.warmUp.count} cases excluded` : `first ${formatDuration(c.warmUp.duration)} excluded`}</td>
            </tr>
            <tr>
              <td>Arrivals</td>
              <td>
                {c.arrival.kind === 'fixed'
                  ? `every ${formatDuration(c.arrival.interval)}`
                  : c.arrival.kind === 'poisson'
                    ? `Poisson process, mean inter-arrival ${formatDuration(c.arrival.interval)} (${round(60 / c.arrival.interval, 2)} per hour)`
                    : `inter-arrival ${describeDistribution(c.arrival.distribution!)} min`}
                {c.arrival.batchSize ? `, batch size ${describeDistribution(c.arrival.batchSize)}` : ''}
              </td>
            </tr>
            <tr>
              <td>Random streams</td>
              <td>Common random numbers: each case has its own stream per element (derived from seed, replication, case and element id). Alternatives that share element ids receive identical random inputs.</td>
            </tr>
            <tr>
              <td>Time unit</td>
              <td>minutes; time 0 = {formatDuration(c.calendarOffset)} after Monday 00:00 (for calendars)</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3 className="row" style={{ gap: 6 }}>
          <TrendingUp size={16} /> Simplifications and defaults
        </h3>
        {run.support.findings.length === 0 ? (
          <p className="muted">No simplifications were needed: every element of the model is simulated with its documented semantics.</p>
        ) : (
          <ul className="stack" style={{ gap: 8, paddingLeft: 18, margin: 0 }}>
            {run.support.findings.map((f, i) => (
              <li key={i}>
                <span className={`badge ${f.level === 'approximation' ? 'badge-warning' : 'badge-info'}`}>{f.level}</span> {f.message}
              </li>
            ))}
          </ul>
        )}
        <div className="divider" />
        <h4>Gateway probabilities</h4>
        <ul className="compact-list">
          {Object.entries(c.gateways).map(([gid, g]) => (
            <li key={gid}>
              {name(gid)}: {Object.entries(g.probabilities).map(([fid, p]) => `${graph?.flows[fid]?.name || name(graph?.flows[fid]?.targetId ?? fid)} ${formatPercent(p, 0)}`).join(', ')}
            </li>
          ))}
          {Object.keys(c.gateways).length === 0 && <li className="muted">No deciding gateways.</li>}
        </ul>
      </div>
    </div>
  );
}
