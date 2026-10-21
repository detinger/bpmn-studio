import { useNavigate, Link } from 'react-router-dom';
import { CheckCircle2, Circle, Clock, GraduationCap, PlayCircle, RotateCcw } from 'lucide-react';
import { LEVELS, ALL_CONCEPTS } from '../../data/lessons';
import { TUTORIALS } from '../../data/tutorials';
import { useProgress } from '../../app/progress';
import { ProgressBar } from '../../components/ui';
import { openTutorialWorkspace } from '../../services/diagrams';
import { useToast } from '../../app/toast';
import { BadgeGrid } from './BadgeGrid';

export default function LearnPage() {
  const { progress, reset } = useProgress();
  const navigate = useNavigate();
  const notify = useToast();
  const done = new Set(progress.completedConcepts);
  const nextConcept = ALL_CONCEPTS.find((c) => !done.has(c.id));

  const startTutorial = async (id: string, restart = false) => {
    try {
      const d = await openTutorialWorkspace(id, restart);
      navigate(`/modeler/${d.id}?tutorial=${id}`);
    } catch (err) {
      notify('The tutorial could not be opened', { kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  return (
    <div className="page">
      <div className="page-narrow">
        <div className="page-header">
          <div>
            <div className="eyebrow">Learning path</div>
            <h1>Learn BPMN step by step</h1>
            <p>
              Five levels take you from the basic building blocks to exception handling. Every concept has a short explanation, a visual example, an interactive token
              demonstration, a typical mistake, an exercise and a knowledge check.
            </p>
          </div>
          <div className="card" style={{ minWidth: 260 }}>
            <div className="row">
              <strong>Your progress</strong>
              <span className="spacer" />
              <span className="muted">
                {done.size} / {ALL_CONCEPTS.length} concepts
              </span>
            </div>
            <div style={{ margin: '8px 0 10px' }}>
              <ProgressBar value={done.size / ALL_CONCEPTS.length} label="Concepts completed" />
            </div>
            {nextConcept ? (
              <Link className="btn btn-primary btn-sm" to={`/learn/${nextConcept.id}`}>
                <PlayCircle size={14} /> {done.size ? 'Continue' : 'Start'}: {nextConcept.title}
              </Link>
            ) : (
              <span className="badge badge-success">All concepts completed</span>
            )}
          </div>
        </div>

        <section style={{ marginBottom: 28 }}>
          <h2>Guided tutorials</h2>
          <p className="muted">Build a model in the real modeler. Each step is checked automatically against your diagram, the validator and the token simulation.</p>
          <div className="card-grid">
            {TUTORIALS.map((t) => {
              const state = progress.tutorials[t.id];
              const stepsDone = state?.completedSteps.filter((s) => t.steps.some((x) => x.id === s)).length ?? 0;
              return (
                <div key={t.id} className="card level-card">
                  <div className="row">
                    <GraduationCap size={18} color="var(--primary)" aria-hidden />
                    <strong>{t.title}</strong>
                    <span className="spacer" />
                    {state?.done && <span className="badge badge-success">Completed</span>}
                  </div>
                  <p className="muted" style={{ margin: 0 }}>
                    {t.description}
                  </p>
                  <div className="row subtle">
                    <Clock size={13} aria-hidden /> {t.minutes} min · {t.steps.length} steps
                  </div>
                  <ProgressBar value={stepsDone / t.steps.length} label={`${t.title}: steps completed`} />
                  <div className="row">
                    <button className="btn btn-sm btn-primary" onClick={() => startTutorial(t.id)}>
                      <PlayCircle size={14} /> {state ? 'Continue' : 'Start tutorial'}
                    </button>
                    {state && (
                      <button className="btn btn-sm btn-ghost" onClick={() => startTutorial(t.id, true)} title="Start again with a fresh diagram">
                        <RotateCcw size={14} /> Start over
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section style={{ marginBottom: 28 }}>
          <h2>Levels</h2>
          <div className="stack">
            {LEVELS.map((level) => {
              const completed = level.concepts.filter((c) => done.has(c.id)).length;
              return (
                <div key={level.level} className="card level-card">
                  <div className="level-head">
                    <span className="level-number" aria-hidden>
                      {level.level}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: 0 }}>
                        Level {level.level}: {level.title}
                      </h3>
                      <div className="muted">{level.description}</div>
                    </div>
                    <span className={`badge${completed === level.concepts.length ? ' badge-success' : ''}`}>
                      {completed} / {level.concepts.length}
                    </span>
                  </div>
                  <ul className="concept-list">
                    {level.concepts.map((c) => {
                      const quiz = progress.quiz[c.id];
                      return (
                        <li key={c.id}>
                          <Link to={`/learn/${c.id}`}>
                            {done.has(c.id) ? <CheckCircle2 size={16} color="var(--success)" aria-label="Completed" /> : <Circle size={16} color="var(--text-subtle)" aria-label="Not completed" />}
                            <span style={{ flex: 1 }}>
                              <strong style={{ fontWeight: 600 }}>{c.title}</strong>
                              <span className="subtle"> — {c.summary}</span>
                            </span>
                            {quiz && (
                              <span className="subtle" title="Best knowledge check result">
                                {quiz.correct}/{quiz.total}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <div className="row" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>Achievements</h2>
            <span className="spacer" />
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => {
                if (window.confirm('Reset all learning progress, quiz results, challenge results and badges? Your diagrams are kept.')) reset();
              }}
            >
              <RotateCcw size={14} /> Reset progress
            </button>
          </div>
          <p className="muted">Badges mark milestones of understanding: completed levels, solved challenges and experiments — not points for clicking.</p>
          <BadgeGrid earned={progress.badges} />
        </section>
      </div>
    </div>
  );
}
