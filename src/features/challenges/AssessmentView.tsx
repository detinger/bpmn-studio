import { Link } from 'react-router-dom';
import { CheckCircle2, CircleDashed, GraduationCap, MinusCircle, XCircle } from 'lucide-react';
import type { AssessmentDimension, AssessmentResult, CriterionResult } from '../../domain/contracts';
import { DIMENSION_LABEL } from '../../domain/assessment/types';

const ORDER: AssessmentDimension[] = ['scenario', 'structure', 'behavior', 'semantics', 'performance', 'reasoning'];

function StatusIcon({ status }: { status: CriterionResult['status'] }) {
  if (status === 'met') return <CheckCircle2 size={16} color="var(--status-good)" aria-label="met" />;
  if (status === 'partial') return <MinusCircle size={16} color="var(--warning)" aria-label="partially met" />;
  if (status === 'not-applicable') return <CircleDashed size={16} color="var(--text-subtle)" aria-label="not assessed" />;
  return <XCircle size={16} color="var(--status-critical)" aria-label="not met" />;
}

export function ScoreRing({ score, passed }: { score: number; passed: boolean }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  return (
    <svg className="score-ring" viewBox="0 0 64 64" role="img" aria-label={`Score ${Math.round(score * 100)} percent`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth="7" />
      <circle cx="32" cy="32" r={r} fill="none" stroke={passed ? 'var(--status-good)' : 'var(--chart-1)'} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${circ * score} ${circ}`} transform="rotate(-90 32 32)" />
      <text x="32" y="37" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--text)">
        {Math.round(score * 100)}%
      </text>
    </svg>
  );
}

export function AssessmentView({ result, notes, onFocus }: { result: AssessmentResult; notes?: string[]; onFocus?: (ids: string[]) => void }) {
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 14, flexWrap: 'nowrap' }}>
        <ScoreRing score={result.score} passed={result.passed} />
        <div>
          <h3 style={{ margin: 0 }}>{result.passed ? 'Challenge solved!' : 'Not solved yet'}</h3>
          <div className="muted">
            {result.criteria.filter((c) => c.status === 'met').length} of {result.criteria.length} criteria met
          </div>
        </div>
      </div>
      {ORDER.map((dim) => {
        const items = result.criteria.filter((c) => c.dimension === dim);
        if (!items.length) return null;
        return (
          <section key={dim}>
            <h4 style={{ marginBottom: 6 }}>{DIMENSION_LABEL[dim]}</h4>
            <ul className="criteria-list">
              {items.map((c) => (
                <li key={c.id}>
                  <StatusIcon status={c.status} />
                  <div style={{ flex: 1 }}>
                    <strong style={{ fontWeight: 600 }}>{c.label}</strong>
                    <div className="subtle" style={{ color: 'var(--text-muted)' }}>
                      {c.feedback}
                    </div>
                    {c.status !== 'met' && c.rationale && <div className="subtle">Why it matters: {c.rationale}</div>}
                  </div>
                  {onFocus && c.elementIds && c.elementIds.length > 0 && c.status !== 'met' && (
                    <button className="btn btn-sm btn-ghost" onClick={() => onFocus(c.elementIds!)}>
                      Show
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {notes && notes.length > 0 && (
        <details>
          <summary className="subtle">Assessment assumptions ({notes.length})</summary>
          <ul className="compact-list">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      )}
      {result.nextConcept && (
        <div className="callout callout-info">
          <GraduationCap size={16} />
          <div>
            Suggested next concept:{' '}
            <Link to={`/learn/${result.nextConcept.conceptId}`}>
              <strong>{result.nextConcept.label}</strong>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
