import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, BarChart3, CheckCircle2, FlaskConical, FolderOpen, GraduationCap, PenTool, PlayCircle, Scale, ShieldCheck, Trophy } from 'lucide-react';
import { ALL_CONCEPTS } from '../data/lessons';
import { CHALLENGES } from '../data/challenges';
import { getExample } from '../data/examples';
import { buildBpmnXml } from '../domain/bpmn/builder';
import { BpmnViewer } from '../components/BpmnViewer';
import { ProgressBar } from '../components/ui';
import { getDiagram, getSettings, type StoredDiagram } from '../storage/db';
import { openExample } from '../services/diagrams';
import { useProgress } from './progress';

const CYCLE = [
  { to: '/learn', icon: GraduationCap, title: 'Learn', text: 'Concepts, encyclopedia and guided tutorials' },
  { to: '/modeler', icon: PenTool, title: 'Model', text: 'Standards-based BPMN 2.0 editor' },
  { to: '/modeler', icon: ShieldCheck, title: 'Validate', text: 'Explained structural and behavioral checks' },
  { to: '/modeler', icon: PlayCircle, title: 'Simulate', text: 'Animated tokens and execution trace' },
  { to: '/simulate', icon: BarChart3, title: 'Analyze', text: 'Discrete-event simulation and KPIs' },
  { to: '/compare', icon: Scale, title: 'Optimize', text: 'AS-IS vs TO-BE experiments' }
];

const HERO_EXAMPLE = 'order-fulfillment';

export function HomePage() {
  const { progress } = useProgress();
  const navigate = useNavigate();
  const [last, setLast] = useState<StoredDiagram | null>(null);
  const heroXml = useMemo(() => {
    const ex = getExample(HERO_EXAMPLE);
    return ex ? buildBpmnXml(ex.spec) : null;
  }, []);

  useEffect(() => {
    getSettings()
      .then((s) => (s.lastDiagramId ? getDiagram(s.lastDiagramId) : undefined))
      .then((d) => setLast(d ?? null))
      .catch(() => undefined);
  }, []);

  const done = new Set(progress.completedConcepts);
  const nextConcept = ALL_CONCEPTS.find((c) => !done.has(c.id));
  const solved = CHALLENGES.filter((c) => progress.challenges[c.id]?.status === 'passed').length;

  return (
    <div className="page">
      <div className="page-narrow">
        <section className="hero">
          <div>
            <div className="eyebrow">Interactive BPMN modeling, simulation and optimization</div>
            <h1>Understand processes by building, running and improving them</h1>
            <p>
              BPMN Studio is a learning environment for Business Process Management. Learn the notation, model processes, see why a model is wrong, watch tokens move
              through it, measure its performance with discrete-event simulation and test redesigns against the original.
            </p>
            <div className="row" style={{ marginTop: 16 }}>
              <Link className="btn btn-primary" to={nextConcept ? `/learn/${nextConcept.id}` : '/learn'}>
                <GraduationCap size={16} /> {done.size ? 'Continue learning' : 'Start learning'}
              </Link>
              <Link className="btn" to="/modeler">
                <PenTool size={16} /> Open the modeler
              </Link>
              <Link className="btn btn-ghost" to="/library">
                <FolderOpen size={16} /> Example library
              </Link>
            </div>
          </div>
          {heroXml && (
            <div className="card" style={{ padding: 10 }}>
              <BpmnViewer xml={heroXml} animate height={260} ariaLabel="Example process: order fulfillment" />
              <div className="row subtle" style={{ marginTop: 6 }}>
                <span>Press Start, then click the start event to send a token through the process.</span>
                <span className="spacer" />
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={async () => {
                    const d = await openExample(HERO_EXAMPLE);
                    navigate(`/modeler/${d.id}`);
                  }}
                >
                  Edit a copy <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )}
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2>The learning cycle</h2>
          <div className="cycle">
            {CYCLE.map((s, i) => (
              <Link key={s.title} to={s.to} className="cycle-step">
                <span className="num">{i + 1}</span>
                <strong>
                  <s.icon size={16} color="var(--primary)" aria-hidden /> {s.title}
                </strong>
                <span>{s.text}</span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2>Pick up where you left off</h2>
          <div className="grid-3">
            <div className="card level-card">
              <div className="row">
                <GraduationCap size={18} color="var(--primary)" aria-hidden />
                <strong>Learning path</strong>
                <span className="spacer" />
                <span className="subtle">
                  {done.size} / {ALL_CONCEPTS.length}
                </span>
              </div>
              <ProgressBar value={done.size / ALL_CONCEPTS.length} label="Concepts completed" />
              {nextConcept ? (
                <Link to={`/learn/${nextConcept.id}`} className="row">
                  Next: {nextConcept.title} <ArrowRight size={13} />
                </Link>
              ) : (
                <span className="row" style={{ color: 'var(--success)' }}>
                  <CheckCircle2 size={14} /> All concepts completed
                </span>
              )}
            </div>
            <div className="card level-card">
              <div className="row">
                <Trophy size={18} color="var(--primary)" aria-hidden />
                <strong>Challenges</strong>
                <span className="spacer" />
                <span className="subtle">
                  {solved} / {CHALLENGES.length}
                </span>
              </div>
              <ProgressBar value={solved / CHALLENGES.length} label="Challenges solved" />
              <Link to="/challenges" className="row">
                {solved ? 'Solve the next challenge' : 'Try your first challenge'} <ArrowRight size={13} />
              </Link>
            </div>
            <div className="card level-card">
              <div className="row">
                <FlaskConical size={18} color="var(--primary)" aria-hidden />
                <strong>Your last model</strong>
              </div>
              {last ? (
                <>
                  <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {last.name}
                  </span>
                  <div className="row">
                    <Link className="btn btn-sm btn-primary" to={`/modeler/${last.id}`}>
                      <PenTool size={14} /> Edit
                    </Link>
                    <Link className="btn btn-sm" to={`/simulate/${last.id}`}>
                      <FlaskConical size={14} /> Simulate
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <span className="muted">No model yet. Start with an example or a blank diagram.</span>
                  <Link to="/library" className="row">
                    Open the library <ArrowRight size={13} />
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
