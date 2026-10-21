import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  CopyPlus,
  Download,
  Eye,
  EyeOff,
  FilePlus2,
  FlaskConical,
  FolderOpen,
  Keyboard,
  Loader2,
  Maximize,
  PlayCircle,
  Redo2,
  Save,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
  AlertCircle
} from 'lucide-react';
import type { Severity } from '../../domain/validation/types';

export type SaveState = 'saved' | 'saving' | 'dirty' | 'error';

interface Props {
  name: string;
  role?: 'as-is' | 'to-be';
  saveState: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  simActive: boolean;
  showIssues: boolean;
  counts?: Record<Severity, number>;
  onRename: (name: string) => void;
  onNew: () => void;
  onOpenLibrary: () => void;
  onImport: (file: File) => void;
  onExportXml: () => void;
  onExportSvg: () => void;
  onExportPng: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onResetZoom: () => void;
  onToggleIssues: () => void;
  onToggleSimulation: () => void;
  onPerformance: () => void;
  onDuplicateToBe: () => void;
  onShortcuts: () => void;
  onSave: () => void;
}

function Menu({ label, icon, children }: { label: string; icon: React.ReactNode; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className="btn btn-sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {icon} {label} <ChevronDown size={12} />
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function ModelerToolbar(p: Props) {
  const [name, setName] = useState(p.name);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setName(p.name), [p.name]);

  const saveLabel = {
    saved: { icon: <Check size={13} />, text: 'Saved' },
    saving: { icon: <Loader2 size={13} className="spin" />, text: 'Saving…' },
    dirty: { icon: <Save size={13} />, text: 'Unsaved' },
    error: { icon: <AlertCircle size={13} />, text: 'Save failed' }
  }[p.saveState];

  return (
    <div className="toolbar" role="toolbar" aria-label="Modeler toolbar">
      <div className="toolbar-group toolbar-title">
        <input
          className="title-input"
          value={name}
          aria-label="Diagram name"
          onChange={(e) => setName(e.target.value)}
          onBlur={() => p.onRename(name)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        {p.role && <span className={`badge ${p.role === 'as-is' ? 'badge-primary' : 'badge-accent'}`}>{p.role.toUpperCase()}</span>}
        <button className={`save-state save-${p.saveState}`} onClick={p.onSave} title="Changes are saved automatically in this browser (IndexedDB). Click or press Ctrl/Cmd+S to save now.">
          {saveLabel.icon} {saveLabel.text}
        </button>
      </div>
      <div className="toolbar-group">
        <Menu label="File" icon={<FilePlus2 size={14} />}>
          {(close) => (
            <>
              <button role="menuitem" onClick={() => (close(), p.onNew())}>
                <FilePlus2 size={14} /> New blank diagram
              </button>
              <button role="menuitem" onClick={() => (close(), p.onOpenLibrary())}>
                <FolderOpen size={14} /> Open from library / examples
              </button>
              <button role="menuitem" onClick={() => (close(), fileRef.current?.click())}>
                <Upload size={14} /> Import BPMN file…
              </button>
              <hr />
              <button role="menuitem" onClick={() => (close(), p.onDuplicateToBe())}>
                <CopyPlus size={14} /> Duplicate as TO-BE
              </button>
            </>
          )}
        </Menu>
        <Menu label="Export" icon={<Download size={14} />}>
          {(close) => (
            <>
              <button role="menuitem" onClick={() => (close(), p.onExportXml())}>
                BPMN 2.0 XML (.bpmn)
              </button>
              <button role="menuitem" onClick={() => (close(), p.onExportSvg())}>
                SVG image
              </button>
              <button role="menuitem" onClick={() => (close(), p.onExportPng())}>
                PNG image
              </button>
            </>
          )}
        </Menu>
        <input
          ref={fileRef}
          type="file"
          accept=".bpmn,.xml,application/xml,text/xml"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onImport(f);
            e.target.value = '';
          }}
        />
      </div>
      <div className="toolbar-group" aria-label="Edit">
        <button className="btn btn-sm btn-icon" onClick={p.onUndo} disabled={!p.canUndo || p.simActive} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo">
          <Undo2 size={15} />
        </button>
        <button className="btn btn-sm btn-icon" onClick={p.onRedo} disabled={!p.canRedo || p.simActive} title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo">
          <Redo2 size={15} />
        </button>
      </div>
      <div className="toolbar-group" aria-label="Zoom">
        <button className="btn btn-sm btn-icon" onClick={p.onZoomOut} title="Zoom out" aria-label="Zoom out">
          <ZoomOut size={15} />
        </button>
        <button className="btn btn-sm zoom-label" onClick={p.onResetZoom} title="Reset zoom to 100%">
          {Math.round(p.zoom * 100)}%
        </button>
        <button className="btn btn-sm btn-icon" onClick={p.onZoomIn} title="Zoom in" aria-label="Zoom in">
          <ZoomIn size={15} />
        </button>
        <button className="btn btn-sm btn-icon" onClick={p.onFit} title="Fit diagram to screen" aria-label="Fit to screen">
          <Maximize size={15} />
        </button>
      </div>
      <span className="spacer" />
      <div className="toolbar-group">
        <button className={`btn btn-sm${p.showIssues ? ' active' : ''}`} onClick={p.onToggleIssues} aria-pressed={p.showIssues} title="Show validation findings on the canvas">
          {p.showIssues ? <Eye size={14} /> : <EyeOff size={14} />} Issues
          {p.counts && (
            <span className="issue-counts">
              {p.counts.error > 0 && <span className="badge badge-error">{p.counts.error}</span>}
              {p.counts.warning > 0 && <span className="badge badge-warning">{p.counts.warning}</span>}
              {p.counts.error === 0 && p.counts.warning === 0 && <span className="badge badge-success">✓</span>}
            </span>
          )}
        </button>
        <button className={`btn btn-sm${p.simActive ? ' active' : ' btn-accent'}`} onClick={p.onToggleSimulation} aria-pressed={p.simActive} title="Animated token simulation (T)">
          <PlayCircle size={14} /> {p.simActive ? 'Exit simulation' : 'Simulate'}
        </button>
        <button className="btn btn-sm" onClick={p.onPerformance} title="Performance simulation for this model">
          <FlaskConical size={14} /> Performance
        </button>
        <button className="btn btn-sm btn-icon btn-ghost" onClick={p.onShortcuts} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
          <Keyboard size={15} />
        </button>
      </div>
    </div>
  );
}
