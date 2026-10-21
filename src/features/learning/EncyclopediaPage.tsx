import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { CATEGORY_LABELS, ENTRIES, getEntry, type EntryCategory } from '../../data/encyclopedia';
import { EntryDetail } from './EntryDetail';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as EntryCategory[];

export default function EncyclopediaPage() {
  const { entryId } = useParams();
  const [query, setQuery] = useState('');
  const entry = entryId ? getEntry(entryId) : undefined;
  const filtered = useMemo(
    () => ENTRIES.filter((e) => !query || `${e.name} ${e.summary}`.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="eyebrow">BPMN encyclopedia</div>
          <h1>{entry ? entry.name : 'All BPMN elements'}</h1>
          {!entry && <p>Every element explains its notation, execution semantics, typical uses, common mistakes and related concepts — with an interactive token-simulation demo.</p>}
        </div>
      </div>
      <div className="ency-layout">
        <nav className="ency-nav" aria-label="BPMN elements">
          <div style={{ padding: 10, position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 20, top: 20, color: 'var(--text-subtle)' }} aria-hidden />
            <input className="input input-sm" style={{ width: '100%', paddingLeft: 28 }} placeholder="Search elements" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search elements" />
          </div>
          {CATEGORIES.map((cat) => {
            const items = filtered.filter((e) => e.category === cat);
            if (!items.length) return null;
            return (
              <div key={cat}>
                <h4>{CATEGORY_LABELS[cat]}</h4>
                {items.map((e) => (
                  <Link key={e.id} to={`/encyclopedia/${e.id}`} className={e.id === entryId ? 'active' : ''}>
                    <span className={e.icon} aria-hidden />
                    {e.name}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>
        <div>
          {entry ? (
            <div className="card">
              <EntryDetail key={entry.id} entry={entry} />
            </div>
          ) : (
            <div className="stack">
              {CATEGORIES.map((cat) => (
                <section key={cat}>
                  <h2>{CATEGORY_LABELS[cat]}</h2>
                  <div className="ency-grid">
                    {filtered
                      .filter((e) => e.category === cat)
                      .map((e) => (
                        <Link key={e.id} to={`/encyclopedia/${e.id}`} className="card card-link ency-card">
                          <span className={e.icon} aria-hidden />
                          <div>
                            <strong>{e.name}</strong>
                            <div className="subtle">{e.summary}</div>
                          </div>
                        </Link>
                      ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
