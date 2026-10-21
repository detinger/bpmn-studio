import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CheckCircle2, ChevronDown, ChevronRight, Crosshair, FlaskConical, ShieldCheck } from 'lucide-react';
import { SeverityIcon } from '../../components/ui';
import {
  LAYER_DESCRIPTION,
  LAYER_LABEL,
  SEVERITY_LABEL,
  SEVERITY_MEANING,
  type Severity,
  type ValidationIssue,
  type ValidationLayer,
  type ValidationReport
} from '../../domain/validation/types';

const LAYERS: ValidationLayer[] = ['structure', 'semantics', 'control-flow', 'executability', 'pedagogy'];
const SEVERITIES: Severity[] = ['error', 'warning', 'recommendation', 'info'];

export function IssueList({
  report,
  onFocus,
  compact
}: {
  report: ValidationReport | null;
  onFocus?: (issue: ValidationIssue) => void;
  compact?: boolean;
}) {
  const [severities, setSeverities] = useState<Set<Severity>>(new Set(['error', 'warning', 'recommendation', 'info']));
  const [grouping, setGrouping] = useState<'layer' | 'severity'>('layer');
  const issues = useMemo(() => (report?.issues ?? []).filter((i) => severities.has(i.severity)), [report, severities]);

  if (!report) return <div className="panel-pad muted">Validating…</div>;

  const groups =
    grouping === 'layer'
      ? LAYERS.map((l) => ({ key: l, title: LAYER_LABEL[l], description: LAYER_DESCRIPTION[l], items: issues.filter((i) => i.layer === l) }))
      : SEVERITIES.map((s) => ({ key: s, title: SEVERITY_LABEL[s], description: SEVERITY_MEANING[s], items: issues.filter((i) => i.severity === s) }));

  const blocking = report.counts.error;
  return (
    <div className="issue-list">
      <div className="panel-pad" style={{ paddingBottom: 8 }}>
        <div className="issue-summary">
          {SEVERITIES.map((s) => (
            <button
              key={s}
              className={`chip${severities.has(s) ? ' selected' : ''}`}
              aria-pressed={severities.has(s)}
              title={`${SEVERITY_LABEL[s]}: ${SEVERITY_MEANING[s]}`}
              onClick={() => {
                const next = new Set(severities);
                if (next.has(s)) next.delete(s);
                else next.add(s);
                setSeverities(next);
              }}
            >
              <SeverityIcon severity={s} size={13} /> {report.counts[s]}
            </button>
          ))}
          <span className="spacer" />
          <select className="select select-sm" value={grouping} onChange={(e) => setGrouping(e.target.value as 'layer' | 'severity')} aria-label="Group issues by">
            <option value="layer">By layer</option>
            <option value="severity">By severity</option>
          </select>
        </div>
        {report.analysis.performed && (
          <div className={`callout ${report.analysis.sound ? 'callout-success' : blocking ? 'callout-error' : 'callout-warning'}`} style={{ marginTop: 10 }}>
            {report.analysis.sound ? <ShieldCheck size={16} color="var(--success)" /> : <SeverityIcon severity={blocking ? 'error' : 'warning'} />}
            <div className="subtle" style={{ color: 'var(--text)' }}>
              {report.analysis.sound
                ? `Control flow verified: ${report.analysis.stateCount} reachable states explored, no deadlocks, no token duplication, no dead paths.`
                : `Formal control-flow analysis explored ${report.analysis.stateCount} states${report.analysis.complete ? '' : ' (incomplete)'} and found problems.`}
            </div>
          </div>
        )}
      </div>
      {groups.map(
        (g) =>
          (g.items.length > 0 || (!compact && grouping === 'layer')) && (
            <section key={g.key} className="issue-group" aria-label={g.title}>
              <header className="issue-group-header" title={g.description}>
                <span>{g.title}</span>
                <span className="badge">{g.items.length}</span>
              </header>
              {g.items.length === 0 ? (
                <div className="issue-empty">
                  <CheckCircle2 size={14} color="var(--success)" /> No findings
                </div>
              ) : (
                g.items.map((i) => <IssueItem key={i.id} issue={i} onFocus={onFocus} />)
              )}
            </section>
          )
      )}
    </div>
  );
}

export function IssueItem({ issue, onFocus }: { issue: ValidationIssue; onFocus?: (issue: ValidationIssue) => void }) {
  const [open, setOpen] = useState(issue.severity === 'error');
  return (
    <article className={`issue issue-${issue.severity}`}>
      <button className="issue-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <SeverityIcon severity={issue.severity} size={15} />
        <span className="issue-title">{issue.title}</span>
        {issue.evidence === 'formal' && issue.severity !== 'info' && <span className="badge badge-primary" title="Proven by exhaustive state-space exploration">formal</span>}
        {issue.evidence === 'heuristic' && <span className="badge" title="A pattern that often indicates a problem; verify with the token simulation">heuristic</span>}
        {issue.engine && (
          <span className="badge" title={issue.engine === 'token-animation' ? 'Concerns the token animation' : 'Concerns the performance simulator'}>
            {issue.engine === 'token-animation' ? 'animation' : 'simulator'}
          </span>
        )}
      </button>
      {open && (
        <div className="issue-body">
          <p>{issue.explanation}</p>
          <dl>
            <dt>Possible consequence</dt>
            <dd>{issue.consequence}</dd>
            <dt>Suggested correction</dt>
            <dd>{issue.suggestion}</dd>
          </dl>
          {issue.witness && issue.witness.length > 0 && (
            <details>
              <summary>Execution that leads to the problem ({issue.witness.length} steps)</summary>
              <ol className="witness">
                {issue.witness.map((w, k) => (
                  <li key={k}>{w}</li>
                ))}
              </ol>
            </details>
          )}
          <div className="row" style={{ marginTop: 6 }}>
            {onFocus && issue.elementIds.length > 0 && (
              <button className="btn btn-sm" onClick={() => onFocus(issue)}>
                <Crosshair size={14} /> Show in diagram
              </button>
            )}
            {issue.learnMore && (
              <Link className="btn btn-sm btn-ghost" to={`/learn/${issue.learnMore.conceptId}`}>
                <BookOpen size={14} /> {issue.learnMore.label}
              </Link>
            )}
            {issue.engine === 'performance-simulation' && (
              <span className="subtle row" style={{ gap: 4 }}>
                <FlaskConical size={12} /> performance simulator
              </span>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
