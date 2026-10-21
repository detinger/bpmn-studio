import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Modeler from 'bpmn-js/lib/Modeler';
import { BpmnPropertiesPanelModule, BpmnPropertiesProviderModule } from 'bpmn-js-properties-panel';
import TokenSimulationModule from 'bpmn-js-token-simulation/lib/modeler';
import { BookOpen, ClipboardList, FlaskConical, GraduationCap, Trophy, PanelRightClose, PanelRightOpen, PlayCircle, SlidersHorizontal } from 'lucide-react';
import { patchLabelLayout, viewerConfig } from './bpmnConfig';
import { fitWithPalette } from './fit';
import { ModelerToolbar, type SaveState } from './ModelerToolbar';
import { ExplainPanel } from './ExplainPanel';
import { ShortcutsDialog } from './ShortcutsDialog';
import { IssueList } from '../validation/IssueList';
import { applyIssueOverlays, focusElements, issuesForElement } from '../validation/overlays';
import { TokenSimulationController, type SimSnapshot } from '../token-simulation/controller';
import { TokenSimulationPanel } from '../token-simulation/TokenSimulationPanel';
import { ElementParameters } from '../performance-simulation/ElementParameters';
import { TutorialPanel } from '../learning/TutorialPanel';
import { ChallengePanel } from '../challenges/ChallengePanel';
import { buildProcessGraph, type ProcessGraph } from '../../domain/bpmn/graph';
import { validateModel } from '../../domain/validation/validate';
import type { ValidationIssue, ValidationReport } from '../../domain/validation/types';
import { syncConfigWithGraph, type SimulationConfig } from '../../domain/simulation/config';
import { getDiagram, listDiagrams, saveDiagram, saveSettings, getSettings, saveSimConfig, duplicateDiagram, type StoredDiagram } from '../../storage/db';
import { createBlankDiagram, importBpmn, loadSyncedConfig } from '../../services/diagrams';
import { useToast } from '../../app/toast';
import { Tabs, downloadText, safeFileName } from '../../components/ui';

type PanelTab = 'properties' | 'explain' | 'issues' | 'simulate' | 'parameters' | 'tutorial' | 'challenge';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BpmnModeler = any;

export default function ModelerPage() {
  const { diagramId } = useParams();
  const [params, setParams] = useSearchParams();
  const tutorialId = params.get('tutorial');
  const navigate = useNavigate();
  const notify = useToast();

  const canvasRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler>(null);
  const [controller, setController] = useState<TokenSimulationController | null>(null);
  const controllerRef = useRef<TokenSimulationController | null>(null);
  const [diagram, setDiagram] = useState<StoredDiagram | null>(null);
  const diagramRef = useRef<StoredDiagram | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [graph, setGraph] = useState<ProcessGraph | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [config, setConfig] = useState<SimulationConfig | null>(null);
  const configRef = useRef<SimulationConfig | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selection, setSelection] = useState<{ id: string; bo: any } | null>(null);
  const [tab, setTab] = useState<PanelTab>(tutorialId ? 'tutorial' : params.get('challenge') ? 'challenge' : 'properties');
  const [undoRedo, setUndoRedo] = useState({ canUndo: false, canRedo: false });
  const [showIssues, setShowIssues] = useState(true);
  const [sim, setSim] = useState<SimSnapshot | null>(null);
  const [shortcuts, setShortcuts] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [zoom, setZoom] = useState(1);
  const saveTimer = useRef<number | undefined>(undefined);
  const analysisTimer = useRef<number | undefined>(undefined);
  const validationSeq = useRef(0);

  configRef.current = config;
  diagramRef.current = diagram;
  const simActive = !!sim && sim.status !== 'off';

  // ---- persistence -----------------------------------------------------------
  const saveNow = useCallback(async () => {
    const modeler = modelerRef.current;
    const d = diagramRef.current;
    if (!modeler || !d) return;
    window.clearTimeout(saveTimer.current);
    setSaveState('saving');
    try {
      const { xml } = await modeler.saveXML({ format: true });
      let svg: string | undefined;
      try {
        svg = (await modeler.saveSVG()).svg;
      } catch {
        svg = undefined;
      }
      const next = await saveDiagram(d.id, { xml, svg });
      if (diagramRef.current?.id === d.id) {
        diagramRef.current = next;
        setDiagram(next);
      }
      setSaveState('saved');
    } catch (err) {
      setSaveState('error');
      notify('Autosave failed', { kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [notify]);

  const refreshAnalysis = useCallback(async () => {
    const modeler = modelerRef.current;
    if (!modeler) return;
    const definitions = modeler.getDefinitions();
    if (!definitions) return;
    const g = buildProcessGraph(definitions);
    setGraph(g);
    let cfg = configRef.current;
    if (cfg && cfg.activities) {
      const synced = syncConfigWithGraph(cfg, g);
      if (synced.added.length || synced.removed.length) {
        cfg = synced.config;
        setConfig(cfg);
        configRef.current = cfg;
        if (diagramRef.current) saveSimConfig(diagramRef.current.id, cfg).catch(() => undefined);
      }
    }
    const seq = ++validationSeq.current;
    try {
      const r = await validateModel({ definitions, graph: g, simulationConfig: cfg?.activities ? cfg : undefined });
      if (seq === validationSeq.current) setReport(r);
    } catch (err) {
      console.error('Validation failed', err);
    }
  }, []);

  // ---- modeler lifecycle -------------------------------------------------------
  useEffect(() => {
    const modeler: BpmnModeler = new Modeler({
      container: canvasRef.current!,
      propertiesPanel: { parent: propsRef.current! },
      additionalModules: [BpmnPropertiesPanelModule, BpmnPropertiesProviderModule, TokenSimulationModule],
      ...viewerConfig()
    });
    patchLabelLayout(modeler);
    modelerRef.current = modeler;
    // exposed for end-to-end tests and debugging
    (window as unknown as { __bpmnStudioModeler?: BpmnModeler }).__bpmnStudioModeler = modeler;
    const ctrl = new TokenSimulationController(modeler);
    controllerRef.current = ctrl;
    setController(ctrl);
    const unsub = ctrl.subscribe((s) => setSim(s));

    const eventBus = modeler.get('eventBus');
    const commandStack = modeler.get('commandStack');
    const onChanged = () => {
      setUndoRedo({ canUndo: commandStack.canUndo(), canRedo: commandStack.canRedo() });
      setSaveState('dirty');
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void saveNow(), 900);
      window.clearTimeout(analysisTimer.current);
      analysisTimer.current = window.setTimeout(() => void refreshAnalysis(), 350);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onSelection = (e: any) => {
      const el = e.newSelection?.[0];
      setSelection(el ? { id: el.id, bo: el.businessObject } : null);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onViewbox = (e: any) => setZoom(e.viewbox?.scale ?? 1);
    const onToggle = (e: { active: boolean }) => {
      if (e.active) {
        setTab((t) => (t === 'tutorial' ? t : 'simulate'));
        setPanelOpen(true);
      }
    };
    eventBus.on('commandStack.changed', onChanged);
    eventBus.on('selection.changed', onSelection);
    eventBus.on('canvas.viewbox.changed', onViewbox);
    eventBus.on('tokenSimulation.toggleMode', onToggle);
    return () => {
      unsub();
      ctrl.dispose();
      window.clearTimeout(saveTimer.current);
      window.clearTimeout(analysisTimer.current);
      modeler.destroy();
      modelerRef.current = null;
    };
  }, [saveNow, refreshAnalysis]);

  // ---- resolve and load diagram ---------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!diagramId) {
        const settings = await getSettings();
        const last = settings.lastDiagramId ? await getDiagram(settings.lastDiagramId) : undefined;
        const target = last ?? (await listDiagrams())[0] ?? (await createBlankDiagram('My first process'));
        if (!cancelled) navigate(`/modeler/${target.id}${params.toString() ? `?${params}` : ''}`, { replace: true });
        return;
      }
      // flush pending changes of the previous diagram
      if (diagramRef.current && diagramRef.current.id !== diagramId && saveTimer.current) await saveNow();
      const d = await getDiagram(diagramId);
      if (cancelled) return;
      if (!d) {
        setLoadError('This diagram does not exist (anymore). Open another one from the library.');
        return;
      }
      setLoadError(null);
      const modeler = modelerRef.current;
      if (!modeler) return;
      try {
        if (controllerRef.current?.isActive()) controllerRef.current.toggle(false);
        const result = await modeler.importXML(d.xml);
        if (cancelled) return;
        if (result.warnings?.length) notify('Diagram imported with warnings', { message: `${result.warnings.length} element(s) could not be imported exactly. See the Issues panel.` });
        fitWithPalette(modeler);
        diagramRef.current = d;
        setDiagram(d);
        setSaveState('saved');
        setUndoRedo({ canUndo: false, canRedo: false });
        setSelection(null);
        const { config: cfg } = await loadSyncedConfig(d);
        if (cancelled) return;
        configRef.current = cfg;
        setConfig(cfg);
        await refreshAnalysis();
        saveSettings({ lastDiagramId: d.id }).catch(() => undefined);
      } catch (err) {
        setLoadError(`The diagram could not be opened: ${err instanceof Error ? err.message : String(err)}`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagramId]);

  // flush on page hide / unmount
  useEffect(() => {
    const onHide = () => {
      if (saveTimer.current) void saveNow();
    };
    window.addEventListener('beforeunload', onHide);
    return () => {
      window.removeEventListener('beforeunload', onHide);
      if (saveTimer.current) void saveNow();
    };
  }, [saveNow]);

  // ---- validation overlays ---------------------------------------------------
  useEffect(() => {
    const modeler = modelerRef.current;
    if (!modeler || !showIssues || simActive || !report) return;
    return applyIssueOverlays(modeler, report, (id) => {
      focusElements(modeler, [id]);
      setTab('explain');
      setPanelOpen(true);
    });
  }, [report, showIssues, simActive]);

  // ---- keyboard shortcuts ------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveNow();
        notify('Saved', { kind: 'success', ttl: 1500 });
      } else if (!typing && e.key === '?' ) {
        setShortcuts(true);
      } else if (!typing && e.altKey && e.key.toLowerCase() === 'v') {
        setTab('issues');
        setPanelOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saveNow, notify]);

  // ---- actions -----------------------------------------------------------------
  const focusIssue = useCallback((issue: ValidationIssue) => {
    if (modelerRef.current) focusElements(modelerRef.current, issue.elementIds);
  }, []);

  const highlight = useCallback((ids: string[]) => {
    if (modelerRef.current) focusElements(modelerRef.current, ids, false);
  }, []);

  const onConfigChange = useCallback(
    (next: SimulationConfig) => {
      setConfig(next);
      configRef.current = next;
      if (diagramRef.current) saveSimConfig(diagramRef.current.id, next).catch(() => undefined);
      window.clearTimeout(analysisTimer.current);
      analysisTimer.current = window.setTimeout(() => void refreshAnalysis(), 400);
    },
    [refreshAnalysis]
  );

  const exportXml = async () => {
    const { xml } = await modelerRef.current.saveXML({ format: true });
    downloadText(`${safeFileName(diagram?.name ?? 'diagram')}.bpmn`, xml, 'application/xml');
  };
  const exportSvg = async () => {
    const { svg } = await modelerRef.current.saveSVG();
    downloadText(`${safeFileName(diagram?.name ?? 'diagram')}.svg`, svg, 'image/svg+xml');
  };
  const exportPng = async () => {
    const { svg } = await modelerRef.current.saveSVG();
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${safeFileName(diagram?.name ?? 'diagram')}.png`;
        a.click();
      });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const onImport = async (file: File) => {
    try {
      const text = await file.text();
      const { diagram: d, warnings } = await importBpmn(text, file.name);
      notify(`Imported “${d.name}”`, { kind: 'success', message: warnings.length ? `${warnings.length} import warning(s) — see the Issues panel.` : undefined });
      navigate(`/modeler/${d.id}`);
    } catch (err) {
      notify('Import failed', { kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const onNew = async () => {
    const d = await createBlankDiagram();
    navigate(`/modeler/${d.id}`);
  };

  const onDuplicateToBe = async () => {
    if (!diagram) return;
    await saveNow();
    const copy = await duplicateDiagram(diagram.id, { asToBe: true });
    notify('TO-BE copy created', { kind: 'success', message: 'Redesign the copy, then compare both versions in “AS-IS vs TO-BE”.' });
    navigate(`/modeler/${copy.id}`);
  };

  const onRename = async (name: string) => {
    if (!diagram || !name.trim() || name === diagram.name) return;
    const next = await saveDiagram(diagram.id, { name: name.trim() });
    setDiagram(next);
  };

  const zoomBy = (step: number) => modelerRef.current?.get('zoomScroll').stepZoom(step);
  const fit = () => modelerRef.current && fitWithPalette(modelerRef.current);
  const resetZoom = () => modelerRef.current?.get('canvas').zoom(1, 'auto');

  const challengeId = params.get('challenge') ?? (diagram?.origin?.kind === 'challenge' && !params.get('noChallenge') ? diagram.origin.ref ?? null : null);

  const selectedIssues = useMemo(() => (selection ? issuesForElement(report, selection.id) : []), [report, selection]);
  const issueCount = (report?.counts.error ?? 0) + (report?.counts.warning ?? 0);

  const tabs: Array<{ id: PanelTab; label: React.ReactNode; badge?: React.ReactNode }> = [
    ...(tutorialId ? [{ id: 'tutorial' as const, label: <><GraduationCap size={14} /> Tutorial</> }] : []),
    ...(challengeId ? [{ id: 'challenge' as const, label: <><Trophy size={14} /> Challenge</> }] : []),
    { id: 'properties', label: <><SlidersHorizontal size={14} /> Properties</> },
    { id: 'explain', label: <><BookOpen size={14} /> Explain</> },
    {
      id: 'issues',
      label: <><ClipboardList size={14} /> Issues</>,
      badge: report ? <span className={`badge ${report.counts.error ? 'badge-error' : issueCount ? 'badge-warning' : 'badge-success'}`}>{report.counts.error || issueCount || '✓'}</span> : undefined
    },
    { id: 'simulate', label: <><PlayCircle size={14} /> Simulate</> },
    { id: 'parameters', label: <><FlaskConical size={14} /> Parameters</> }
  ];

  return (
    <div className={`workspace${panelOpen ? '' : ' panel-closed'}`}>
      <ModelerToolbar
        name={diagram?.name ?? ''}
        role={diagram?.role}
        saveState={saveState}
        canUndo={undoRedo.canUndo}
        canRedo={undoRedo.canRedo}
        zoom={zoom}
        simActive={simActive}
        showIssues={showIssues}
        counts={report?.counts}
        onRename={onRename}
        onNew={onNew}
        onOpenLibrary={() => navigate('/library')}
        onImport={onImport}
        onExportXml={exportXml}
        onExportSvg={exportSvg}
        onExportPng={exportPng}
        onUndo={() => modelerRef.current?.get('commandStack').undo()}
        onRedo={() => modelerRef.current?.get('commandStack').redo()}
        onZoomIn={() => zoomBy(1)}
        onZoomOut={() => zoomBy(-1)}
        onFit={fit}
        onResetZoom={resetZoom}
        onToggleIssues={() => setShowIssues((v) => !v)}
        onToggleSimulation={() => controller?.toggle()}
        onPerformance={() => diagram && navigate(`/simulate/${diagram.id}`)}
        onDuplicateToBe={onDuplicateToBe}
        onShortcuts={() => setShortcuts(true)}
        onSave={() => void saveNow()}
      />
      <div className="workspace-body">
        <div className="canvas-area">
          <div ref={canvasRef} className="bpmn-canvas bio-theme-parent" aria-label="BPMN modeling canvas" />
          {loadError && (
            <div className="canvas-overlay">
              <div className="callout callout-error">
                <div>
                  <strong>{loadError}</strong>
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className="btn btn-sm" onClick={() => navigate('/library')}>
                      Open library
                    </button>
                    <button className="btn btn-sm" onClick={onNew}>
                      New diagram
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {simActive && (
            <div className="sim-banner" role="status">
              <PlayCircle size={14} /> Token simulation — modeling is locked. Click elements to trigger events or switch routes.
            </div>
          )}
          <button className="btn btn-sm panel-toggle" onClick={() => setPanelOpen(!panelOpen)} aria-label={panelOpen ? 'Hide side panel' : 'Show side panel'} title={panelOpen ? 'Hide side panel' : 'Show side panel'}>
            {panelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        </div>
        <aside className="side-panel" aria-label="Side panel">
          <Tabs label="Side panel" tabs={tabs} value={tab} onChange={setTab} />
          <div className="side-panel-content">
            <div ref={propsRef} className="properties-host" hidden={tab !== 'properties'} />
            {tab === 'tutorial' && tutorialId && (
              <TutorialPanel
                tutorialId={tutorialId}
                graph={graph}
                report={report}
                sim={sim}
                onClose={() => {
                  params.delete('tutorial');
                  setParams(params, { replace: true });
                  setTab('properties');
                }}
              />
            )}
            {tab === 'challenge' && challengeId && (
              <ChallengePanel
                challengeId={challengeId}
                config={config}
                getXml={async () => (await modelerRef.current.saveXML({ format: true })).xml}
                onFocus={(ids) => modelerRef.current && focusElements(modelerRef.current, ids)}
                onClose={() => {
                  params.delete('challenge');
                  params.set('noChallenge', '1');
                  setParams(params, { replace: true });
                  setTab('properties');
                }}
              />
            )}
            {tab === 'explain' && <ExplainPanel businessObject={selection?.bo} issues={selectedIssues} onFocusIssue={focusIssue} />}
            {tab === 'issues' && <IssueList report={report} onFocus={focusIssue} />}
            {tab === 'simulate' && <TokenSimulationPanel controller={controller} graph={graph} onHighlight={highlight} />}
            {tab === 'parameters' && <ElementParameters graph={graph} config={config} selectedId={selection?.id ?? null} diagramId={diagram?.id} onChange={onConfigChange} />}
          </div>
        </aside>
      </div>
      {shortcuts && <ShortcutsDialog onClose={() => setShortcuts(false)} />}
    </div>
  );
}
