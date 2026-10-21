/**
 * Performance-simulation parameters of the selected element, shown in the
 * modeler side panel. The parameters are stored in the separate simulation
 * configuration, never in the BPMN XML.
 */
import { Link } from 'react-router-dom';
import { FlaskConical, Info } from 'lucide-react';
import type { GraphNode, ProcessGraph } from '../../domain/bpmn/graph';
import { displayName } from '../../domain/bpmn/graph';
import { configurableElements, defaultActivityConfig, type SimulationConfig } from '../../domain/simulation/config';
import { DistributionEditor } from './DistributionEditor';
import { parseIsoDurationMinutes, formatDuration } from '../../utils/duration';

interface Props {
  graph: ProcessGraph | null;
  config: SimulationConfig | null;
  selectedId: string | null;
  diagramId?: string;
  onChange: (config: SimulationConfig) => void;
}

export function ElementParameters({ graph, config, selectedId, diagramId, onChange }: Props) {
  if (!graph || !config) return <div className="panel-pad muted">Loading…</div>;
  const node = selectedId ? graph.nodes[selectedId] : undefined;
  const { activities, gateways, events } = configurableElements(graph);
  const isActivity = node && activities.some((a) => a.id === node.id);
  const isGateway = node && gateways.some((g) => g.id === node.id);
  const isEvent = node && events.some((e) => e.id === node.id);

  const update = (fn: (c: SimulationConfig) => void) => {
    const next = structuredClone(config);
    fn(next);
    next.version = (config.version ?? 0) + 1;
    onChange(next);
  };

  return (
    <div className="panel-pad stack" style={{ gap: 12 }}>
      <div className="callout callout-info">
        <Info size={16} aria-hidden />
        <div className="subtle" style={{ color: 'var(--text-muted)' }}>
          Parameters for the <strong>performance simulation</strong>. They are stored separately from the BPMN XML and do not affect the token animation.
        </div>
      </div>
      {!node && <p className="muted">Select an activity, gateway or event to edit its simulation parameters.</p>}
      {node && !isActivity && !isGateway && !isEvent && (
        <p className="muted">“{displayName(graph, node.id)}” has no simulation parameters. Activities have durations and resources, deciding gateways have routing probabilities and catch events have waiting times.</p>
      )}
      {node && isActivity && <ActivityParams node={node} config={config} graph={graph} update={update} />}
      {node && isGateway && <GatewayParams node={node} config={config} graph={graph} update={update} />}
      {node && isEvent && <EventParams node={node} config={config} update={update} />}
      {diagramId && (
        <Link className="btn btn-sm" to={`/simulate/${diagramId}`}>
          <FlaskConical size={14} /> Open in the performance lab
        </Link>
      )}
    </div>
  );
}

type Update = (fn: (c: SimulationConfig) => void) => void;

function ActivityParams({ node, config, graph, update }: { node: GraphNode; config: SimulationConfig; graph: ProcessGraph; update: Update }) {
  const cfg = config.activities[node.id] ?? defaultActivityConfig(node.type);
  const hasContent = node.kind === 'subProcess' && (graph.scopes[node.id]?.nodeIds.length ?? 0) > 0;
  const set = (patch: Partial<typeof cfg>) =>
    update((c) => {
      c.activities[node.id] = { ...cfg, ...patch };
    });
  return (
    <div className="stack" style={{ gap: 10 }}>
      <h4 style={{ margin: 0 }}>{displayName(graph, node.id)}</h4>
      {hasContent ? (
        <p className="muted subtle">This sub-process takes the time of its content. Configure the activities inside it.</p>
      ) : (
        <DistributionEditor value={cfg.duration} onChange={(d) => set({ duration: d })} label="Processing time" />
      )}
      {!hasContent && (
        <div className="field">
          <label htmlFor="pool-select">Performed by</label>
          <select id="pool-select" className="select select-sm" value={cfg.resourcePoolId ?? ''} onChange={(e) => set({ resourcePoolId: e.target.value || null })}>
            <option value="">No resource (automated / unlimited)</option>
            {config.resourcePools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.capacity})
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field-row">
        <div className="field">
          <label htmlFor="fixed-cost">Fixed cost per execution (€)</label>
          <input id="fixed-cost" className="input input-sm" type="number" min={0} step="any" value={cfg.fixedCost} onChange={(e) => set({ fixedCost: Math.max(0, Number(e.target.value) || 0) })} />
        </div>
        <div className="field">
          <label htmlFor="queue-cap">Queue capacity</label>
          <input
            id="queue-cap"
            className="input input-sm"
            type="number"
            min={0}
            placeholder="unlimited"
            value={cfg.queueCapacity ?? ''}
            onChange={(e) => set({ queueCapacity: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value))) })}
          />
        </div>
      </div>
      {node.loop === 'standard' && (
        <div className="field-row">
          <div className="field">
            <label htmlFor="repeat-p">Repeat probability (rework)</label>
            <input id="repeat-p" className="input input-sm" type="number" min={0} max={0.99} step={0.05} value={cfg.repeatProbability ?? 0} onChange={(e) => set({ repeatProbability: clamp(Number(e.target.value), 0, 0.99) })} />
          </div>
          <div className="field">
            <label htmlFor="max-it">Max. iterations</label>
            <input id="max-it" className="input input-sm" type="number" min={1} value={cfg.maxIterations ?? 10} onChange={(e) => set({ maxIterations: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
          </div>
        </div>
      )}
      {(node.loop === 'parallel' || node.loop === 'sequential') && (
        <div className="field">
          <label htmlFor="instances">Number of instances ({node.loop === 'parallel' ? 'parallel' : 'sequential'})</label>
          <input id="instances" className="input input-sm" type="number" min={1} value={cfg.instances ?? node.loopCardinality ?? 3} onChange={(e) => set({ instances: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
        </div>
      )}
    </div>
  );
}

function GatewayParams({ node, config, graph, update }: { node: GraphNode; config: SimulationConfig; graph: ProcessGraph; update: Update }) {
  const probs = config.gateways[node.id]?.probabilities ?? {};
  const sum = node.outgoing.reduce((a, f) => a + (probs[f] ?? 0), 0);
  const inclusive = node.gateway === 'inclusive';
  const eventBased = node.gateway === 'eventBased';
  return (
    <div className="stack" style={{ gap: 10 }}>
      <h4 style={{ margin: 0 }}>{displayName(graph, node.id)}</h4>
      <p className="subtle" style={{ margin: 0 }}>
        {inclusive
          ? 'Each outgoing flow is taken independently with its probability (at least one: the default flow, or the most likely one).'
          : eventBased
            ? 'Leave all probabilities at 0 to let the configured waiting times of the following events race; otherwise the event is chosen by probability.'
            : 'Probability that a case takes each path. Values are normalized if they do not sum to 1.'}
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Outgoing flow</th>
            <th className="num">Probability</th>
          </tr>
        </thead>
        <tbody>
          {node.outgoing.map((fid) => {
            const flow = graph.flows[fid];
            const label = flow.name || `→ ${displayName(graph, flow.targetId)}`;
            return (
              <tr key={fid}>
                <td>
                  {label}
                  {flow.isDefault && <span className="badge" style={{ marginLeft: 6 }}>default</span>}
                </td>
                <td className="num">
                  <input
                    className="input input-sm"
                    style={{ width: 80, textAlign: 'right' }}
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    aria-label={`Probability for ${label}`}
                    value={probs[fid] ?? 0}
                    onChange={(e) =>
                      update((c) => {
                        c.gateways[node.id] = { probabilities: { ...probs, [fid]: clamp(Number(e.target.value), 0, 1) } };
                      })
                    }
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!inclusive && !eventBased && Math.abs(sum - 1) > 1e-6 && <div className="subtle" style={{ color: 'var(--warning)' }}>Sum is {sum.toFixed(2)} — the simulator normalizes the values.</div>}
      {!inclusive && (
        <button
          className="btn btn-sm"
          onClick={() =>
            update((c) => {
              c.gateways[node.id] = { probabilities: Object.fromEntries(node.outgoing.map((f) => [f, Math.round((1 / node.outgoing.length) * 1000) / 1000])) };
            })
          }
        >
          Equal probabilities
        </button>
      )}
    </div>
  );
}

function EventParams({ node, config, update }: { node: GraphNode; config: SimulationConfig; update: Update }) {
  const ev = config.events[node.id] ?? {};
  const isTimer = node.eventDefinition === 'timer';
  const boundaryNonTimer = node.kind === 'boundary' && !isTimer;
  const iso = parseIsoDurationMinutes(node.timerExpression);
  return (
    <div className="stack" style={{ gap: 10 }}>
      <h4 style={{ margin: 0 }}>{node.name || node.id}</h4>
      {boundaryNonTimer ? (
        <div className="field">
          <label htmlFor="bnd-p">Probability per execution of the activity</label>
          <input
            id="bnd-p"
            className="input input-sm"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={ev.probability ?? 0}
            onChange={(e) =>
              update((c) => {
                c.events[node.id] = { ...ev, probability: clamp(Number(e.target.value), 0, 1) };
              })
            }
          />
          <span className="hint">The event occurs at the moment the activity would complete.</span>
        </div>
      ) : (
        <>
          {isTimer && iso !== null && !ev.delay && <p className="subtle">Uses the timer definition from the model: {formatDuration(iso)}. Configure a distribution to override it.</p>}
          {ev.delay ? (
            <>
              <DistributionEditor value={ev.delay} label={node.kind === 'boundary' ? 'Time until the timer fires' : 'Waiting time'} onChange={(d) => update((c) => void (c.events[node.id] = { ...ev, delay: d }))} />
              <button className="btn btn-sm" onClick={() => update((c) => void (c.events[node.id] = { ...ev, delay: undefined }))}>
                {isTimer ? 'Use timer definition from the model' : 'Remove waiting time'}
              </button>
            </>
          ) : (
            <button className="btn btn-sm" onClick={() => update((c) => void (c.events[node.id] = { ...ev, delay: { type: 'exponential', mean: iso ?? 60 } }))}>
              Configure waiting time
            </button>
          )}
        </>
      )}
    </div>
  );
}

function clamp(n: number, lo: number, hi: number) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
