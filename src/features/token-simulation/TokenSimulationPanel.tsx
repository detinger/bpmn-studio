import { useEffect, useState } from 'react';
import {
  AlertOctagon,
  Footprints,
  Gauge,
  HelpCircle,
  ListOrdered,
  Pause,
  Play,
  Power,
  RotateCcw,
  Shuffle,
  SkipForward,
  Square
} from 'lucide-react';
import type { DecisionEntry, SimSnapshot, TokenExplanation, TokenInfo, TokenSimulationController } from './controller';
import { SimStatusBadge } from '../../components/BpmnViewer';
import type { ProcessGraph } from '../../domain/bpmn/graph';
import { displayName } from '../../domain/bpmn/graph';

const STATE_LABEL: Record<TokenInfo['state'], string> = {
  moving: 'moving',
  'waiting-join': 'waiting at join',
  'waiting-event': 'waiting for event',
  'waiting-step': 'enabled (step)',
  active: 'active'
};

const KIND_ICON: Record<string, string> = {
  start: '●',
  enter: '▶',
  complete: '✓',
  decision: '◆',
  join: '⧓',
  end: '■',
  event: '◎',
  boundary: '⚡'
};

export function TokenSimulationPanel({
  controller,
  graph,
  onHighlight
}: {
  controller: TokenSimulationController | null;
  graph: ProcessGraph | null;
  onHighlight: (elementIds: string[]) => void;
}) {
  const [snap, setSnap] = useState<SimSnapshot | null>(controller?.state ?? null);
  const [selected, setSelected] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<TokenExplanation | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => controller?.subscribe(setSnap), [controller]);

  useEffect(() => {
    if (!controller || !selected) {
      setExplanation(null);
      return;
    }
    const exists = snap?.tokens.some((t) => t.scopeId === selected);
    if (!exists) {
      setSelected(null);
      setExplanation(null);
      return;
    }
    setExplanation(controller.explain(selected));
  }, [controller, selected, snap]);

  if (!controller || !snap) return <div className="panel-pad muted">The token simulation is loading…</div>;

  const active = snap.status !== 'off';
  const xorGateways = graph ? Object.values(graph.nodes).filter((n) => n.gateway === 'exclusive' && n.outgoing.length > 1) : [];

  if (!active) {
    return (
      <div className="panel-pad stack">
        <div>
          <h3 style={{ marginBottom: 4 }}>Animated token simulation</h3>
          <p className="muted">
            Watch tokens move through the diagram to understand <strong>execution semantics</strong>: decisions, parallelism, synchronization, loops, boundary events and deadlocks.
          </p>
          <p className="subtle">
            This is an animation of control flow — it has no time, resources or statistics. For performance analysis use the performance lab.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => controller.toggle(true)}>
          <Power size={16} /> Enter simulation mode
        </button>
        <div className="subtle">Modeling is locked while the simulation runs. Shortcut: <kbd>T</kbd> toggles the mode when the canvas has focus.</div>
      </div>
    );
  }

  const selectToken = (t: TokenInfo) => {
    setSelected(t.scopeId);
    onHighlight([t.elementId]);
  };

  return (
    <div className="sim-panel">
      <div className="panel-pad" style={{ paddingBottom: 10 }}>
        <div className="row" style={{ marginBottom: 10 }}>
          <SimStatusBadge status={snap.status} />
          <span className="subtle">
            {snap.instancesStarted} started · {snap.instancesCompleted} completed
          </span>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={() => controller.toggle(false)} title="Leave simulation mode">
            <Square size={14} /> Stop
          </button>
        </div>
        <div className="row" role="toolbar" aria-label="Simulation controls">
          <button className="btn btn-sm btn-primary" onClick={() => controller.start()} title="Start a new process instance at the start event">
            <Play size={14} /> Start instance
          </button>
          <button className="btn btn-sm" onClick={() => controller.playPause()} title="Play / pause" aria-label="Play or pause">
            {snap.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button className="btn btn-sm" onClick={() => controller.step()} disabled={!snap.stepMode || snap.enabled.length === 0} title="Step forward: complete the next enabled activity">
            <SkipForward size={14} /> Step
          </button>
          <button className="btn btn-sm" onClick={() => controller.reset()} title="Reset: remove all tokens">
            <RotateCcw size={14} />
          </button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className={`btn btn-sm${snap.stepMode ? ' active' : ''}`} aria-pressed={snap.stepMode} onClick={() => controller.setStepMode(!snap.stepMode)} title="Activities wait until you press Step">
            <Footprints size={14} /> Step mode
          </button>
          <button className={`btn btn-sm${snap.randomRouting ? ' active' : ''}`} aria-pressed={snap.randomRouting} onClick={() => controller.setRandomRouting(!snap.randomRouting)} title="Exclusive gateways pick a random outgoing flow">
            <Shuffle size={14} /> Random routes
          </button>
          <label className="row subtle" style={{ gap: 4 }}>
            <Gauge size={14} aria-hidden />
            <select className="select select-sm" value={snap.speed} onChange={(e) => controller.setSpeed(Number(e.target.value))} aria-label="Execution speed">
              {[0.25, 0.5, 1, 1.5, 2, 3].map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {snap.unsupported.length > 0 && (
        <div className="panel-pad" style={{ paddingTop: 0 }}>
          <div className="callout callout-warning">
            <AlertOctagon size={16} color="var(--warning)" />
            <div className="subtle" style={{ color: 'var(--text)' }}>
              <strong>Not executed by the animation:</strong> {snap.unsupported.map((u) => u.label).join(', ')}. Tokens stop at these elements; this is a limitation of the animation, not of your model.
            </div>
          </div>
        </div>
      )}
      {snap.status === 'blocked' && snap.blocked && (
        <div className="panel-pad" style={{ paddingTop: 0 }}>
          <div className="callout callout-error">
            <AlertOctagon size={16} color="var(--error)" />
            <div className="subtle" style={{ color: 'var(--text)' }}>
              <strong>Blocked — deadlock.</strong>{' '}
              {snap.blocked.joins.map((j) => (
                <span key={j.gatewayId}>
                  The parallel join “{j.label}” waits for a token from {j.missingFrom.map((m) => `“${m}”`).join(', ')}, but no such token exists.{' '}
                </span>
              ))}
              <button className="btn btn-sm btn-ghost" onClick={() => onHighlight(snap.blocked!.joins.map((j) => j.gatewayId))}>
                Show
              </button>
            </div>
          </div>
        </div>
      )}
      {snap.status === 'waiting' && (
        <div className="panel-pad" style={{ paddingTop: 0 }}>
          <div className="callout callout-info">
            <HelpCircle size={16} />
            <div className="subtle" style={{ color: 'var(--text)' }}>
              {snap.stepMode && snap.enabled.length ? 'Activities are enabled — press Step to complete the next one.' : 'Tokens wait for an event. Trigger it with the play button shown on the waiting element.'}
            </div>
          </div>
        </div>
      )}

      <section className="sim-section">
        <h4>Active tokens ({snap.tokens.length})</h4>
        {snap.tokens.length === 0 ? (
          <p className="subtle">No tokens. Press “Start instance” or the play button at a start event.</p>
        ) : (
          <ul className="list-plain token-list">
            {snap.tokens.map((t) => (
              <li key={t.scopeId}>
                <button className={`token-item${selected === t.scopeId ? ' selected' : ''}`} onClick={() => selectToken(t)}>
                  <span className={`token-dot state-${t.state}`} aria-hidden />
                  <span className="token-label">{t.label}</span>
                  <span className="subtle">{STATE_LABEL[t.state]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {explanation && (
          <div className="explain-box" aria-live="polite">
            <strong>{explanation.title}</strong>
            <dl>
              <dt>Why does this token exist?</dt>
              <dd>{explanation.why}</dd>
              {explanation.producedBy && (
                <>
                  <dt>Produced by</dt>
                  <dd>{explanation.producedBy}</dd>
                </>
              )}
              {explanation.path && (
                <>
                  <dt>Path condition</dt>
                  <dd>{explanation.path}</dd>
                </>
              )}
              <dt>What is needed to continue?</dt>
              <dd>{explanation.continuation}</dd>
            </dl>
          </div>
        )}
      </section>

      {snap.stepMode && (
        <section className="sim-section">
          <h4>Enabled activities ({snap.enabled.length})</h4>
          {snap.enabled.length === 0 ? <p className="subtle">None waiting.</p> : <ul className="compact-list">{snap.enabled.map((e, i) => <li key={i}>{e.label}</li>)}</ul>}
        </section>
      )}

      {xorGateways.length > 0 && (
        <section className="sim-section">
          <h4>Gateway routes</h4>
          <p className="subtle">Which path each exclusive gateway takes next{snap.randomRouting ? ' (random routing is on)' : ''}.</p>
          {xorGateways.map((g) => (
            <RouteSelector key={g.id} controller={controller} graph={graph!} gatewayId={g.id} disabled={snap.randomRouting} snapshotVersion={snap.history.length} />
          ))}
        </section>
      )}

      <section className="sim-section">
        <h4>Gateway decisions ({snap.decisions.length})</h4>
        {snap.decisions.length === 0 ? <p className="subtle">No decisions yet.</p> : <DecisionList decisions={snap.decisions} />}
      </section>

      <section className="sim-section">
        <h4>Completed activities</h4>
        {snap.completed.length === 0 ? (
          <p className="subtle">None yet.</p>
        ) : (
          <ul className="compact-list">
            {snap.completed.map((c) => (
              <li key={c.elementId}>
                {c.label} {c.count > 1 && <span className="badge badge-warning" title="Executed more than once">×{c.count}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="sim-section">
        <div className="row">
          <h4 style={{ margin: 0 }}>
            <ListOrdered size={14} aria-hidden /> Execution history
          </h4>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={() => setShowRaw(!showRaw)} aria-pressed={showRaw}>
            {showRaw ? 'History' : 'Raw event trace'}
          </button>
        </div>
        {showRaw ? (
          <ol className="trace-list mono">
            {snap.raw.slice(-300).map((r) => (
              <li key={r.step}>
                #{r.step} {r.action} {r.elementType.replace('bpmn:', '')} <span className="subtle">{r.elementId}</span>
              </li>
            ))}
          </ol>
        ) : snap.history.length === 0 ? (
          <p className="subtle">Nothing executed yet.</p>
        ) : (
          <ol className="trace-list">
            {snap.history.slice(-200).map((h) => (
              <li key={`${h.step}-${h.elementId}`}>
                <button className="link-button" onClick={() => onHighlight([h.elementId])}>
                  <span className="trace-kind" aria-hidden>
                    {KIND_ICON[h.kind]}
                  </span>
                  {h.kind === 'decision' ? `${h.label} → ${h.detail}` : h.label}
                  {h.kind !== 'decision' && h.detail && <span className="subtle"> — {h.detail}</span>}
                  {h.kind === 'complete' && <span className="subtle"> completed</span>}
                  {h.kind === 'enter' && <span className="subtle"> started</span>}
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
      {graph && snap.completed.some((c) => c.count > 1) && !graph.nodes[snap.completed.find((c) => c.count > 1)!.elementId]?.loop && (
        <div className="panel-pad">
          <div className="callout callout-warning">
            <AlertOctagon size={16} color="var(--warning)" />
            <div className="subtle" style={{ color: 'var(--text)' }}>
              {snap.completed
                .filter((c) => c.count > 1)
                .map((c) => displayName(graph, c.elementId))
                .join(', ')}{' '}
              ran more than once. Intended (a loop or several instances)? Otherwise check for parallel branches merged without synchronization.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DecisionList({ decisions }: { decisions: DecisionEntry[] }) {
  return (
    <ul className="compact-list">
      {decisions.slice(-50).map((d) => (
        <li key={d.step}>
          <strong>{d.gatewayLabel}</strong> → {d.flowLabel} <span className="subtle">({d.mode === 'random' ? 'random' : 'selected route'})</span>
        </li>
      ))}
    </ul>
  );
}

function RouteSelector({
  controller,
  graph,
  gatewayId,
  disabled,
  snapshotVersion
}: {
  controller: TokenSimulationController;
  graph: ProcessGraph;
  gatewayId: string;
  disabled: boolean;
  snapshotVersion: number;
}) {
  const node = graph.nodes[gatewayId];
  const [value, setValue] = useState<string>(() => controller.activeRoute(gatewayId) ?? node.outgoing[0]);
  useEffect(() => {
    const active = controller.activeRoute(gatewayId);
    if (active) setValue(active);
  }, [controller, gatewayId, snapshotVersion]);
  return (
    <div className="field" style={{ marginBottom: 6 }}>
      <label htmlFor={`route-${gatewayId}`}>{displayName(graph, gatewayId)}</label>
      <select
        id={`route-${gatewayId}`}
        className="select select-sm"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          setValue(e.target.value);
          controller.selectRoute(gatewayId, e.target.value);
        }}
      >
        {node.outgoing.map((f) => (
          <option key={f} value={f}>
            {graph.flows[f].name || `→ ${displayName(graph, graph.flows[f].targetId)}`}
          </option>
        ))}
      </select>
    </div>
  );
}
