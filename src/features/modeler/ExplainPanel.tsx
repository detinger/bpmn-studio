import { Link } from 'react-router-dom';
import { MousePointerClick } from 'lucide-react';
import { entriesForBusinessObject, getEntry } from '../../data/encyclopedia';
import { EntryDetail } from '../learning/EntryDetail';
import { IssueItem } from '../validation/IssueList';
import type { ValidationIssue } from '../../domain/validation/types';
import { useState } from 'react';

/** Educational explanation of the selected element. */
export function ExplainPanel({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  businessObject,
  issues,
  onFocusIssue
}: {
  businessObject: unknown;
  issues: ValidationIssue[];
  onFocusIssue: (i: ValidationIssue) => void;
}) {
  const ids = entriesForBusinessObject(businessObject);
  const [chosen, setChosen] = useState<string | null>(null);
  const currentId = chosen && ids.includes(chosen) ? chosen : ids[0];
  const entry = currentId ? getEntry(currentId) : undefined;

  if (!businessObject || !entry) {
    return (
      <div className="panel-pad stack">
        <div className="empty" style={{ padding: '24px 8px' }}>
          <MousePointerClick size={28} />
          <h3>Select an element</h3>
          <p>Click any element in the diagram to see what it means, how it executes, when to use it, typical mistakes and a small interactive example.</p>
          <Link className="btn btn-sm" to="/encyclopedia">
            Browse the encyclopedia
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="panel-pad">
      {ids.length > 1 && (
        <div className="chip-row" style={{ marginBottom: 10 }}>
          {ids.map((id) => (
            <button key={id} className={`chip${id === currentId ? ' selected' : ''}`} onClick={() => setChosen(id)}>
              {getEntry(id)?.name}
            </button>
          ))}
        </div>
      )}
      {issues.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <h4>Findings for this element</h4>
          {issues.map((i) => (
            <IssueItem key={i.id} issue={i} onFocus={onFocusIssue} />
          ))}
        </div>
      )}
      <EntryDetail key={entry.id} entry={entry} compact />
    </div>
  );
}
