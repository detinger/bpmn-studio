/**
 * Read-only BPMN viewer with optional token animation and highlighting,
 * used for miniature examples, demos, exercises and challenges.
 */
import { useEffect, useRef, useState } from 'react';
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import TokenSimulationViewerModule from 'bpmn-js-token-simulation/lib/viewer';
import { Gauge, Pause, Play, RotateCcw, SkipForward, Footprints } from 'lucide-react';
import { patchLabelLayout, viewerConfig } from '../features/modeler/bpmnConfig';
import { TokenSimulationController, type SimSnapshot } from '../features/token-simulation/controller';

export interface BpmnViewerProps {
  xml: string;
  animate?: boolean;
  height?: number;
  className?: string;
  /** Click on a flow node (exercises such as "click the element that…"). */
  onElementClick?: (id: string) => void;
  highlights?: Array<{ ids: string[]; kind: 'element' | 'success' | 'error' }>;
  /** Overlays with small text badges positioned at elements. */
  badges?: Array<{ id: string; html: string }>;
  ariaLabel?: string;
}

export function BpmnViewer({ xml, animate = false, height = 260, className, onElementClick, highlights, badges, ariaLabel }: BpmnViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewerRef = useRef<any>(null);
  const controllerRef = useRef<TokenSimulationController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(0);
  const [sim, setSim] = useState<SimSnapshot | null>(null);
  const clickRef = useRef(onElementClick);
  clickRef.current = onElementClick;

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const viewer: any = new NavigatedViewer({
      container: containerRef.current!,
      additionalModules: animate ? [TokenSimulationViewerModule] : [],
      ...viewerConfig()
    });
    patchLabelLayout(viewer);
    viewerRef.current = viewer;
    let controller: TokenSimulationController | null = null;
    let unsub: (() => void) | undefined;
    if (animate) {
      controller = new TokenSimulationController(viewer);
      controllerRef.current = controller;
      unsub = controller.subscribe(setSim);
    }
    viewer.on('element.click', (e: { element: { id: string; type: string; labelTarget?: { id: string; type: string } } }) => {
      const el = e.element.labelTarget ?? e.element;
      if (el.type === 'bpmn:Process' || el.type === 'bpmn:Collaboration') return;
      clickRef.current?.(el.id);
    });
    return () => {
      unsub?.();
      controller?.dispose();
      viewer.destroy();
      viewerRef.current = null;
      controllerRef.current = null;
    };
  }, [animate]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    let cancelled = false;
    viewer
      .importXML(xml)
      .then(() => {
        if (cancelled) return;
        setError(null);
        viewer.get('canvas').zoom('fit-viewport', 'auto');
        if (animate) controllerRef.current?.toggle(true);
        setReady((r) => r + 1);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [xml, animate]);

  // highlights and badges
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready) return;
    const canvas = viewer.get('canvas');
    const registry = viewer.get('elementRegistry');
    const overlays = viewer.get('overlays');
    const applied: Array<[string, string]> = [];
    for (const h of highlights ?? []) {
      for (const id of h.ids) {
        if (!registry.get(id)) continue;
        const cls = h.kind === 'success' ? 'highlight-success' : h.kind === 'error' ? 'highlight-error' : 'highlight-element';
        canvas.addMarker(id, cls);
        applied.push([id, cls]);
      }
    }
    const overlayIds: string[] = [];
    for (const b of badges ?? []) {
      if (!registry.get(b.id)) continue;
      overlayIds.push(overlays.add(b.id, 'studio-badge', { position: { top: -14, right: 10 }, html: b.html }));
    }
    return () => {
      for (const [id, cls] of applied) canvas.removeMarker(id, cls);
      for (const o of overlayIds) overlays.remove(o);
    };
  }, [highlights, badges, ready]);

  const c = controllerRef.current;
  return (
    <div className={className}>
      <div
        ref={containerRef}
        className={`mini-canvas bpmn-canvas bio-theme-parent${onElementClick ? ' clickable' : ''}`}
        style={{ height }}
        role="img"
        aria-label={ariaLabel ?? 'BPMN diagram'}
      />
      {error && <div className="callout callout-error" style={{ marginTop: 8 }}>Diagram could not be displayed: {error}</div>}
      {animate && c && sim && (
        <div className="mini-controls" role="toolbar" aria-label="Animation controls">
          <button className="btn btn-sm btn-primary" onClick={() => (sim.status === 'ready' || sim.status === 'completed' || sim.status === 'blocked' ? (c.reset(), setTimeout(() => c.start(), 30)) : c.start())}>
            <Play size={14} /> {sim.status === 'ready' ? 'Start' : 'Restart'}
          </button>
          <button className="btn btn-sm" onClick={() => c.playPause()} disabled={sim.status === 'ready' || sim.status === 'completed'} title="Pause or resume">
            {sim.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button className="btn btn-sm" onClick={() => c.reset()} title="Reset">
            <RotateCcw size={14} />
          </button>
          <button className={`btn btn-sm${sim.stepMode ? ' active' : ''}`} onClick={() => c.setStepMode(!sim.stepMode)} title="Step mode: activities wait until you press Step" aria-pressed={sim.stepMode}>
            <Footprints size={14} /> Step mode
          </button>
          {sim.stepMode && (
            <button className="btn btn-sm" onClick={() => c.step()} disabled={sim.enabled.length === 0} title="Complete the next waiting activity">
              <SkipForward size={14} /> Step
            </button>
          )}
          <label className="row subtle" style={{ gap: 4 }}>
            <Gauge size={14} aria-hidden />
            <select className="select select-sm" value={sim.speed} onChange={(e) => c.setSpeed(Number(e.target.value))} aria-label="Animation speed">
              {[0.5, 1, 1.5, 2, 3].map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
          </label>
          <span className="spacer" />
          <SimStatusBadge status={sim.status} />
        </div>
      )}
      {animate && sim?.status === 'blocked' && sim.blocked && (
        <div className="callout callout-error" style={{ marginTop: 8 }}>
          <div>
            <strong>Blocked (deadlock).</strong>{' '}
            {sim.blocked.joins.map((j) => `“${j.label}” waits for a token from ${j.missingFrom.map((m) => `“${m}”`).join(', ')}, which will never arrive.`).join(' ')}
          </div>
        </div>
      )}
    </div>
  );
}

export function SimStatusBadge({ status }: { status: SimSnapshot['status'] }) {
  const map: Record<SimSnapshot['status'], [string, string]> = {
    off: ['badge', 'Off'],
    ready: ['badge badge-primary', 'Ready'],
    running: ['badge badge-success', 'Running'],
    paused: ['badge badge-warning', 'Paused'],
    waiting: ['badge badge-accent', 'Waiting for you'],
    blocked: ['badge badge-error', 'Blocked'],
    completed: ['badge badge-info', 'Completed']
  };
  const [cls, text] = map[status];
  return <span className={cls}>{text}</span>;
}
