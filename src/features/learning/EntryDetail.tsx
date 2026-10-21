import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BookOpen, Eye, GraduationCap, Lightbulb, Play, Workflow } from 'lucide-react';
import { BpmnViewer } from '../../components/BpmnViewer';
import { Modal, RichText } from '../../components/ui';
import { buildBpmnXml } from '../../domain/bpmn/builder';
import { getEntry, type EncyclopediaEntry } from '../../data/encyclopedia';
import { getConcept } from '../../data/lessons';

/** Full explanation of one BPMN element (the seven educational facets). */
export function EntryDetail({ entry, compact = false }: { entry: EncyclopediaEntry; compact?: boolean }) {
  const [demoIndex, setDemoIndex] = useState(0);
  const [modal, setModal] = useState(false);
  const demo = entry.demos[demoIndex];
  const xml = useMemo(() => (demo ? buildBpmnXml(demo.spec) : ''), [demo]);
  const lesson = entry.lessonId ? getConcept(entry.lessonId) : undefined;

  return (
    <article className={`entry-detail${compact ? ' compact' : ''}`}>
      <header className="entry-header">
        <span className={`entry-icon ${entry.icon}`} aria-hidden />
        <div>
          <h2 style={{ marginBottom: 2 }}>{entry.name}</h2>
          <p className="muted" style={{ margin: 0 }}>
            {entry.summary}
          </p>
        </div>
      </header>

      <section className="entry-section">
        <h4>
          <Eye size={15} aria-hidden /> Graphical meaning
        </h4>
        <p>{entry.graphical}</p>
      </section>
      <section className="entry-section">
        <h4>
          <Workflow size={15} aria-hidden /> Execution semantics
        </h4>
        <p>{entry.semantics}</p>
      </section>
      {entry.sections?.map((s) => (
        <section key={s.title} className="entry-section">
          <h4>{s.title}</h4>
          <RichText text={s.text} />
        </section>
      ))}
      <section className="entry-section">
        <h4>
          <Lightbulb size={15} aria-hidden /> Typical use cases
        </h4>
        <ul>
          {entry.useCases.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      </section>
      <section className="entry-section">
        <h4>
          <AlertTriangle size={15} aria-hidden /> Common modeling mistakes
        </h4>
        <ul>
          {entry.mistakes.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      </section>
      <section className="entry-section">
        <h4>
          <BookOpen size={15} aria-hidden /> Related concepts
        </h4>
        <div className="chip-row">
          {entry.related.map((r) => {
            const e = getEntry(r);
            return e ? (
              <Link key={r} className="chip" to={`/encyclopedia/${r}`}>
                {e.name}
              </Link>
            ) : null;
          })}
          {lesson && (
            <Link className="chip" to={`/learn/${lesson.id}`}>
              <GraduationCap size={12} /> Lesson: {lesson.title}
            </Link>
          )}
        </div>
      </section>
      {demo && (
        <section className="entry-section">
          <h4>
            <Play size={15} aria-hidden /> Interactive example
          </h4>
          {entry.demos.length > 1 && (
            <div className="chip-row" style={{ marginBottom: 8 }} role="tablist" aria-label="Examples">
              {entry.demos.map((d, i) => (
                <button key={d.title} role="tab" aria-selected={i === demoIndex} className={`chip${i === demoIndex ? ' selected' : ''}`} onClick={() => setDemoIndex(i)}>
                  {d.title}
                </button>
              ))}
            </div>
          )}
          <p className="subtle">{demo.hint}</p>
          <BpmnViewer key={`${entry.id}-${demoIndex}`} xml={xml} animate={demo.animate !== false} height={compact ? 220 : 300} ariaLabel={`${entry.name}: ${demo.title}`} />
          {compact && (
            <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setModal(true)}>
              Open larger demo
            </button>
          )}
        </section>
      )}
      {modal && demo && (
        <Modal title={`${entry.name} — ${demo.title}`} onClose={() => setModal(false)} width={1100}>
          <p className="muted">{demo.hint}</p>
          <BpmnViewer xml={xml} animate={demo.animate !== false} height={480} />
        </Modal>
      )}
    </article>
  );
}
