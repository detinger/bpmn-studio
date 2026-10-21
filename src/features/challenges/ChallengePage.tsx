/** Challenge detail: scenario, interaction for the challenge type, progressive hints and explained assessment. */
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ClipboardCheck, Clock, FlaskConical, Lightbulb, Loader2, PenTool, Play, RotateCcw } from 'lucide-react';
import { getChallenge } from '../../data/challenges';
import {
  CHALLENGE_TYPE_LABEL,
  type Challenge,
  type CompareChallenge,
  type DeadlockChallenge,
  type ImproveChallenge,
  type ModelChallenge,
  type PredictChallenge
} from '../../domain/assessment/types';
import { evaluateComparison, evaluateDeadlock, evaluatePrediction } from '../../domain/assessment/evaluate';
import type { AssessmentResult } from '../../domain/contracts';
import { buildBpmnXml, type DiagramSpec } from '../../domain/bpmn/builder';
import { parseBpmnXml } from '../../domain/bpmn/parse';
import { displayName, type ProcessGraph } from '../../domain/bpmn/graph';
import { createDefaultConfig } from '../../domain/simulation/config';
import { applyPreset } from '../../domain/simulation/preset';
import type { SimulationRun } from '../../domain/simulation/experiment';
import { BpmnViewer } from '../../components/BpmnViewer';
import { Callout, RichText } from '../../components/ui';
import { useProgress } from '../../app/progress';
import { useToast } from '../../app/toast';
import { formatDuration, formatMoney, formatPercent } from '../../utils/duration';
import { runSimulation } from '../performance-simulation/simClient';
import { OptionRow } from '../learning/ExerciseView';
import { AssessmentView } from './AssessmentView';
import { describeCriterion } from './ChallengePanel';
import { findChallengeDiagram, startChallengeWorkspace } from './assess';
import { ChallengeTypeIcon } from './ChallengeTypeIcon';

type Highlight = NonNullable<Parameters<typeof BpmnViewer>[0]['highlights']>[number];

export default function ChallengePage() {
  const { challengeId } = useParams();
  const ch = challengeId ? getChallenge(challengeId) : undefined;
  if (!ch) return <Navigate to="/challenges" replace />;
  return <ChallengeView key={ch.id} ch={ch} />;
}

function ChallengeView({ ch }: { ch: Challenge }) {
  const { progress, recordChallenge } = useProgress();
  const [hints, setHints] = useState(0);
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const state = progress.challenges[ch.id];

  const submit = (r: AssessmentResult) => {
    setResult(r);
    recordChallenge(ch.id, r, hints);
  };

  return (
    <div className="page">
      <div className="page-narrow">
        <div className="page-header">
          <div>
            <div className="eyebrow">
              <Link to="/challenges">Challenges</Link> · <ChallengeTypeIcon type={ch.type} size={12} /> {CHALLENGE_TYPE_LABEL[ch.type]}
            </div>
            <h1>{ch.title}</h1>
            <p>{ch.summary}</p>
            <div className="row subtle">
              Level {ch.level} · <Clock size={13} aria-hidden /> ~{ch.minutes} min
              {state && (
                <>
                  {' '}
                  · {state.attempts} attempt{state.attempts === 1 ? '' : 's'} · best {Math.round(state.bestScore * 100)}%
                </>
              )}
              {state?.status === 'passed' && <span className="badge badge-success">Solved</span>}
            </div>
          </div>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <section className="card">
            <h3>Scenario</h3>
            <RichText text={ch.scenario} />
          </section>

          {(ch.type === 'build' || ch.type === 'fix' || ch.type === 'improve') && <ModelChallengeView ch={ch} />}
          {ch.type === 'predict' && <PredictChallengeView ch={ch} result={result} onSubmit={submit} />}
          {ch.type === 'deadlock' && <DeadlockChallengeView ch={ch} result={result} onSubmit={submit} />}
          {ch.type === 'compare' && <CompareChallengeView ch={ch} result={result} onSubmit={submit} />}

          {ch.type !== 'build' && ch.type !== 'fix' && ch.type !== 'improve' && (
            <>
              <HintList hints={ch.hints} shown={hints} onMore={() => setHints(hints + 1)} />
              {result && (
                <section className="card" aria-live="polite">
                  <AssessmentView result={result} />
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function HintList({ hints, shown, onMore }: { hints: string[]; shown: number; onMore: () => void }) {
  if (!hints.length) return null;
  return (
    <section className="card stack" style={{ gap: 8 }}>
      <h3 style={{ margin: 0 }}>Hints</h3>
      {hints.slice(0, shown).map((h, i) => (
        <Callout key={i}>
          <strong>Hint {i + 1}:</strong> {h}
        </Callout>
      ))}
      {shown < hints.length ? (
        <div>
          <button className="btn btn-sm" onClick={onMore}>
            <Lightbulb size={14} /> {shown === 0 ? 'Show a hint' : 'Next hint'} ({shown}/{hints.length})
          </button>
        </div>
      ) : (
        <span className="subtle">No more hints.</span>
      )}
    </section>
  );
}

function useGraph(spec: DiagramSpec) {
  const xml = useMemo(() => buildBpmnXml(spec), [spec]);
  const [graph, setGraph] = useState<ProcessGraph | null>(null);
  useEffect(() => {
    let cancelled = false;
    parseBpmnXml(xml).then(({ graph: g }) => !cancelled && setGraph(g));
    return () => {
      cancelled = true;
    };
  }, [xml]);
  return { xml, graph };
}

// ----------------------------------------------------------------------------- build / fix / improve

function ModelChallengeView({ ch }: { ch: ModelChallenge | ImproveChallenge }) {
  const navigate = useNavigate();
  const notify = useToast();
  const [existing, setExisting] = useState<string | null | undefined>(undefined);
  const startXml = useMemo(() => (ch.start ? buildBpmnXml(ch.start) : null), [ch]);

  useEffect(() => {
    findChallengeDiagram(ch.id).then((d) => setExisting(d?.id ?? null));
  }, [ch.id]);

  const open = async (restart: boolean) => {
    try {
      const id = !restart && existing ? existing : (await startChallengeWorkspace(ch)).id;
      navigate(`/modeler/${id}?challenge=${ch.id}`);
    } catch (err) {
      notify('The challenge could not be opened', { kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <>
      {startXml && ch.start && ch.start.nodes.length > 1 && (
        <section className="card">
          <h3>{ch.type === 'fix' ? 'The broken model' : ch.type === 'improve' ? 'The current (AS-IS) process' : 'Starting point'}</h3>
          <BpmnViewer xml={startXml} height={280} ariaLabel="Starting model of the challenge" />
        </section>
      )}
      <section className="card">
        <h3>What will be checked</h3>
        <ul className="compact-list">
          {ch.criteria.map((c, i) => (
            <li key={i}>{describeCriterion(c, ch)}</li>
          ))}
          {ch.type === 'improve' && ch.targets.map((t) => <li key={t.label}>{t.label}</li>)}
          {ch.type === 'improve' && <li>At most {ch.maxWorkers} workers in total</li>}
        </ul>
        {ch.type === 'improve' && (
          <p className="subtle">
            The assessment simulates your redesign with a fixed workload, seed and activity durations, so targets can only be met by changing the process — not the input data.
          </p>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" onClick={() => open(false)} disabled={existing === undefined}>
            <PenTool size={15} /> {existing ? 'Continue in the modeler' : 'Start in the modeler'}
          </button>
          {existing && (
            <button className="btn btn-ghost" onClick={() => open(true)} title="Create a fresh copy of the starting model">
              <RotateCcw size={15} /> Start over
            </button>
          )}
        </div>
        <p className="subtle" style={{ marginBottom: 0 }}>
          Model your solution, then press <strong>Check my solution</strong> in the Challenge tab of the modeler. Hints are available there, too.
        </p>
      </section>
    </>
  );
}

// ----------------------------------------------------------------------------- predict

function PredictChallengeView({ ch, result, onSubmit }: { ch: PredictChallenge; result: AssessmentResult | null; onSubmit: (r: AssessmentResult) => void }) {
  const { xml, graph } = useGraph(ch.spec);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [focus, setFocus] = useState<string[]>([]);
  const [watch, setWatch] = useState(false);
  const name = (id: string) => (graph ? displayName(graph, id) : id);
  const highlights = useMemo<Highlight[]>(() => (focus.length ? [{ ids: focus, kind: 'error' }] : []), [focus]);

  const toggle = (sc: string, id: string) =>
    setAnswers((a) => {
      const cur = a[sc] ?? [];
      return { ...a, [sc]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });

  return (
    <section className="card stack" style={{ gap: 12 }}>
      <div className="row">
        <h3 style={{ margin: 0 }}>The process</h3>
        <span className="spacer" />
        {result && (
          <button className="btn btn-sm" onClick={() => setWatch(!watch)} aria-pressed={watch}>
            <Play size={14} /> {watch ? 'Static view' : 'Watch the token simulation'}
          </button>
        )}
      </div>
      <BpmnViewer key={watch ? 'watch' : 'static'} xml={xml} animate={watch} height={340} highlights={watch ? undefined : highlights} ariaLabel="Process to predict" />
      <p className="muted" style={{ margin: 0 }}>
        For each situation, select <strong>every</strong> activity that will be executed.
      </p>
      <div className="grid-2">
        {ch.scenarios.map((sc) => (
          <fieldset key={sc.id} className="card" style={{ margin: 0 }}>
            <legend style={{ fontWeight: 650, padding: '0 4px' }}>{sc.description}</legend>
            {ch.candidates.map((id) => (
              <OptionRow key={id} label={name(id)} type="checkbox" name={`${ch.id}-${sc.id}`} selected={(answers[sc.id] ?? []).includes(id)} onToggle={() => toggle(sc.id, id)} />
            ))}
          </fieldset>
        ))}
      </div>
      <div>
        <button
          className="btn btn-primary"
          disabled={!graph}
          onClick={() => {
            const r = evaluatePrediction(ch, graph!, answers);
            setFocus([]);
            onSubmit(r);
          }}
        >
          <ClipboardCheck size={15} /> Check my predictions
        </button>
      </div>
      {result && <FocusHint result={result} onFocus={setFocus} />}
    </section>
  );
}

// ----------------------------------------------------------------------------- deadlock

function DeadlockChallengeView({ ch, result, onSubmit }: { ch: DeadlockChallenge; result: AssessmentResult | null; onSubmit: (r: AssessmentResult) => void }) {
  const { xml, graph } = useGraph(ch.spec);
  const [clicked, setClicked] = useState<string | null>(null);
  const [option, setOption] = useState<number | null>(null);
  const [reveal, setReveal] = useState(false);
  const located = result?.criteria.find((c) => c.id === 'locate');
  const highlights = useMemo<Highlight[]>(() => {
    const h: Highlight[] = [];
    if (clicked) h.push({ ids: [clicked], kind: 'element' });
    if (reveal && located?.elementIds) h.push({ ids: located.elementIds, kind: located.status === 'met' ? 'success' : 'error' });
    return h;
  }, [clicked, reveal, located]);

  return (
    <section className="card stack" style={{ gap: 12 }}>
      <h3 style={{ margin: 0 }}>Find the cause</h3>
      <p className="muted" style={{ margin: 0 }}>
        Start the token simulation to see where execution blocks, then <strong>click the element</strong> that is the structural cause of the deadlock.
      </p>
      <BpmnViewer
        xml={xml}
        animate
        height={380}
        onElementClick={(id) => graph?.nodes[id] && setClicked(id)}
        highlights={highlights}
        ariaLabel="Process with a deadlock"
      />
      <div className="subtle">{clicked ? <>Selected element: <strong>{graph ? displayName(graph, clicked) : clicked}</strong></> : 'No element selected yet.'}</div>
      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 650, marginBottom: 6 }}>{ch.question}</legend>
        {ch.options.map((o, i) => (
          <OptionRow key={i} label={o} type="radio" name={`${ch.id}-explain`} selected={option === i} onToggle={() => setOption(i)} />
        ))}
      </fieldset>
      <div className="row">
        <button
          className="btn btn-primary"
          disabled={!graph || clicked === null || option === null}
          onClick={() => {
            setReveal(true);
            onSubmit(evaluateDeadlock(ch, graph!, clicked, option));
          }}
        >
          <ClipboardCheck size={15} /> Check my answer
        </button>
        {(clicked === null || option === null) && <span className="subtle">Select an element and choose an explanation.</span>}
      </div>
    </section>
  );
}

// ----------------------------------------------------------------------------- compare

const METRIC_LABEL: Record<CompareChallenge['metric'], string> = {
  cycleTime: 'average cycle time',
  waitingTime: 'average waiting time',
  costPerCase: 'cost per case',
  slaCompliance: 'SLA compliance'
};

function CompareChallengeView({ ch, result, onSubmit }: { ch: CompareChallenge; result: AssessmentResult | null; onSubmit: (r: AssessmentResult) => void }) {
  const { recordExperiment } = useProgress();
  const [runs, setRuns] = useState<Record<string, SimulationRun> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [reason, setReason] = useState<number | null>(null);

  const simulate = async () => {
    setError(null);
    const out: Record<string, SimulationRun> = {};
    try {
      for (const [i, alt] of ch.alternatives.entries()) {
        setBusy(`Simulating “${alt.name}” (${i + 1} of ${ch.alternatives.length})…`);
        const xml = buildBpmnXml(alt.spec);
        const { graph } = await parseBpmnXml(xml);
        const config = applyPreset(createDefaultConfig(graph), alt.sim, graph);
        out[alt.id] = await runSimulation(xml, config, { modelName: alt.name }, (d, t) => setBusy(`Simulating “${alt.name}”: replication ${d} of ${t}`)).promise;
      }
      setRuns(out);
      recordExperiment();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const values = runs ? Object.fromEntries(ch.alternatives.map((a) => [a.id, runs[a.id].kpis[ch.metric].mean])) : null;

  return (
    <>
      <div className="grid-2">
        {ch.alternatives.map((alt, i) => (
          <AlternativeCard key={alt.id} alt={alt} letter={String.fromCharCode(65 + i)} />
        ))}
      </div>
      <section className="card stack" style={{ gap: 12 }}>
        <div className="row">
          <h3 style={{ margin: 0 }}>Simulation evidence</h3>
          <span className="spacer" />
          <button className="btn btn-primary" onClick={simulate} disabled={!!busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <FlaskConical size={15} />} {runs ? 'Run again' : 'Run both simulations'}
          </button>
        </div>
        {busy && <div className="subtle" aria-live="polite">{busy}</div>}
        {error && <Callout kind="error" title="The simulation failed">{error}</Callout>}
        {!runs && !busy && <p className="muted" style={{ margin: 0 }}>Both alternatives are simulated with the same workload, random seed and number of replications.</p>}
        {runs && <CompareTable ch={ch} runs={runs} />}
      </section>
      <section className="card stack" style={{ gap: 12 }}>
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 650, marginBottom: 6 }}>{ch.question}</legend>
          {ch.alternatives.map((a) => (
            <OptionRow key={a.id} label={a.name} type="radio" name={`${ch.id}-choice`} selected={choice === a.id} onToggle={() => setChoice(a.id)} />
          ))}
        </fieldset>
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 650, marginBottom: 6 }}>Which explanation fits your choice best?</legend>
          {ch.reasons.map((r, i) => (
            <OptionRow key={i} label={r.text} type="radio" name={`${ch.id}-reason`} selected={reason === i} onToggle={() => setReason(i)} />
          ))}
        </fieldset>
        <div className="row">
          <button className="btn btn-primary" disabled={!values || choice === null || reason === null} onClick={() => onSubmit(evaluateComparison(ch, values!, choice, reason))}>
            <ClipboardCheck size={15} /> Check my answer
          </button>
          {!values && <span className="subtle">Run the simulations first — the answer must be based on evidence.</span>}
        </div>
        {result && !result.passed && <span className="subtle">Tip: compare the waiting times and the utilization of the resources in the table above.</span>}
      </section>
    </>
  );
}

function AlternativeCard({ alt, letter }: { alt: CompareChallenge['alternatives'][number]; letter: string }) {
  const xml = useMemo(() => buildBpmnXml(alt.spec), [alt]);
  return (
    <section className="card">
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="level-number" style={{ width: 28, height: 28, fontSize: 14, borderRadius: 8 }} aria-hidden>
          {letter}
        </span>
        <div>
          <strong>{alt.name}</strong>
          <div className="subtle">{alt.description}</div>
        </div>
      </div>
      <BpmnViewer xml={xml} height={170} ariaLabel={`Alternative ${letter}: ${alt.name}`} />
      <div className="chip-row" style={{ marginTop: 8 }}>
        {alt.sim.pools.map((p) => (
          <span key={p.id} className="chip">
            {p.name}: {p.capacity} {p.capacity === 1 ? 'worker' : 'workers'}
          </span>
        ))}
      </div>
    </section>
  );
}

function CompareTable({ ch, runs }: { ch: CompareChallenge; runs: Record<string, SimulationRun> }) {
  const [a, b] = ch.alternatives;
  const ra = runs[a.id];
  const rb = runs[b.id];
  const maxUtil = (r: SimulationRun) => Math.max(0, ...Object.values(r.pools).map((p) => p.utilization.mean));
  const rows: Array<{ label: string; va: number; vb: number; ca?: number; cb?: number; fmt: (v: number) => string; lowerBetter: boolean; key?: string }> = [
    { key: 'cycleTime', label: 'Average cycle time', va: ra.kpis.cycleTime.mean, vb: rb.kpis.cycleTime.mean, ca: ra.kpis.cycleTime.ciHalfWidth, cb: rb.kpis.cycleTime.ciHalfWidth, fmt: (v) => formatDuration(v), lowerBetter: true },
    { key: 'waitingTime', label: 'Average waiting time', va: ra.kpis.waitingTime.mean, vb: rb.kpis.waitingTime.mean, ca: ra.kpis.waitingTime.ciHalfWidth, cb: rb.kpis.waitingTime.ciHalfWidth, fmt: (v) => formatDuration(v), lowerBetter: true },
    { label: 'Average processing time', va: ra.kpis.processingTime.mean, vb: rb.kpis.processingTime.mean, fmt: (v) => formatDuration(v), lowerBetter: true },
    { key: 'costPerCase', label: 'Cost per case', va: ra.kpis.costPerCase.mean, vb: rb.kpis.costPerCase.mean, fmt: (v) => formatMoney(v), lowerBetter: true },
    { label: 'Highest resource utilization', va: maxUtil(ra), vb: maxUtil(rb), fmt: (v) => formatPercent(v), lowerBetter: true },
    { label: 'Throughput per hour', va: ra.kpis.throughputPerHour.mean, vb: rb.kpis.throughputPerHour.mean, fmt: (v) => v.toFixed(2), lowerBetter: false }
  ];
  return (
    <div className="table-wrap">
      <table className="table compare-table">
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">{a.name}</th>
            <th scope="col">{b.name}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} style={r.key === ch.metric ? { fontWeight: 650 } : undefined}>
              <th scope="row" style={{ fontWeight: r.key === ch.metric ? 650 : 500 }}>
                {r.label}
                {r.key === ch.metric && <span className="badge badge-primary" style={{ marginLeft: 6 }}>asked</span>}
              </th>
              <td>
                {r.fmt(r.va)} {r.ca !== undefined && Number.isFinite(r.ca) && <span className="ci">± {r.fmt(r.ca)}</span>}
              </td>
              <td>
                {r.fmt(r.vb)} {r.cb !== undefined && Number.isFinite(r.cb) && <span className="ci">± {r.fmt(r.cb)}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="subtle" style={{ marginBottom: 0 }}>
        {ra.replicationCount} independent replications per alternative; ± is the half width of the 95% confidence interval. The question is about the {METRIC_LABEL[ch.metric]}.
      </p>
    </div>
  );
}

/** After an assessment: offer to highlight the elements of unmet criteria in the diagram. */
function FocusHint({ result, onFocus }: { result: AssessmentResult; onFocus: (ids: string[]) => void }) {
  const ids = [...new Set(result.criteria.filter((c) => c.status !== 'met').flatMap((c) => c.elementIds ?? []))];
  if (!ids.length) return null;
  return (
    <div>
      <button className="btn btn-sm" onClick={() => onFocus(ids)}>
        Highlight the activities you missed or added
      </button>
    </div>
  );
}
