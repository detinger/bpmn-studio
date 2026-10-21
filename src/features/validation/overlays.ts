/** Validation markers and badges on the bpmn-js canvas. */
import type { Severity, ValidationIssue, ValidationReport } from '../../domain/validation/types';
import { SEVERITY_ORDER } from '../../domain/validation/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Diagram = any;

const MARKERS = ['has-issue-error', 'has-issue-warning'];

export function applyIssueOverlays(modeler: Diagram, report: ValidationReport | null, onClick: (elementId: string) => void): () => void {
  const canvas = modeler.get('canvas');
  const overlays = modeler.get('overlays');
  const registry = modeler.get('elementRegistry');
  const perElement = new Map<string, { severity: Severity; count: number }>();
  for (const issue of report?.issues ?? []) {
    if (issue.severity === 'info') continue;
    for (const id of issue.elementIds) {
      const prev = perElement.get(id);
      if (!prev) perElement.set(id, { severity: issue.severity, count: 1 });
      else {
        prev.count++;
        if (SEVERITY_ORDER[issue.severity] < SEVERITY_ORDER[prev.severity]) prev.severity = issue.severity;
      }
    }
  }
  const marked: Array<[string, string]> = [];
  for (const [id, info] of perElement) {
    const el = registry.get(id);
    if (!el) continue;
    if (info.severity === 'error' || info.severity === 'warning') {
      const m = `has-issue-${info.severity}`;
      canvas.addMarker(id, m);
      marked.push([id, m]);
    }
    if (el.waypoints) continue; // no badges on connections
    if (!el.parent || el.type === 'bpmn:Process' || el.type === 'bpmn:Collaboration') continue; // root elements
    const btn = document.createElement('button');
    btn.className = `issue-marker ${info.severity}`;
    btn.type = 'button';
    btn.textContent = String(info.count);
    btn.title = `${info.count} finding(s) — click to show`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(id);
    });
    overlays.add(id, 'studio-issues', { position: { top: -10, right: 10 }, html: btn });
  }
  return () => {
    try {
      overlays.remove({ type: 'studio-issues' });
      for (const [id, m] of marked) if (registry.get(id)) canvas.removeMarker(id, m);
    } catch {
      /* diagram may already be destroyed */
    }
  };
}

export function clearIssueMarkers(modeler: Diagram) {
  const canvas = modeler.get('canvas');
  modeler.get('elementRegistry').forEach((el: { id: string }) => MARKERS.forEach((m) => canvas.removeMarker(el.id, m)));
}

/** Briefly highlight elements and bring them into view. */
export function focusElements(modeler: Diagram, ids: string[], select = true) {
  const registry = modeler.get('elementRegistry');
  const canvas = modeler.get('canvas');
  const elements = ids.map((id) => registry.get(id)).filter(Boolean);
  if (!elements.length) return;
  try {
    canvas.scrollToElement(elements[0], { top: 120, bottom: 120, left: 200, right: 200 });
  } catch {
    /* element may be on another plane */
  }
  if (select) {
    try {
      modeler.get('selection').select(elements);
    } catch {
      /* viewer without selection */
    }
  }
  for (const el of elements) canvas.addMarker(el.id, 'issue-focus');
  window.setTimeout(() => {
    for (const el of elements) if (registry.get(el.id)) canvas.removeMarker(el.id, 'issue-focus');
  }, 1800);
}

export function issuesForElement(report: ValidationReport | null, id: string): ValidationIssue[] {
  return (report?.issues ?? []).filter((i) => i.elementIds.includes(id));
}
