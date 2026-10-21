/** One concept of the learning path: explanation, example, demo, mistake, exercise and knowledge check. */
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Eye, ListChecks, Play, PenLine, Sparkles } from 'lucide-react';
import { getConcept, nextConcept, previousConcept, LEVELS, type Concept } from '../../data/lessons';
import { getEntry } from '../../data/encyclopedia';
import { BpmnViewer } from '../../components/BpmnViewer';
import { Callout, RichText } from '../../components/ui';
import { buildBpmnXml } from '../../domain/bpmn/builder';
import { useProgress } from '../../app/progress';
import { ExerciseView, exerciseKey } from './ExerciseView';
import { QuizView } from './QuizView';

type Step = 'explain' | 'example' | 'demo' | 'mistake' | 'exercise' | 'quiz';

const STEPS: Array<{ id: Step; label: string; icon: typeof Eye }> = [
  { id: 'explain', label: 'Explanation', icon: BookOpen },
  { id: 'example', label: 'Visual example', icon: Eye },
  { id: 'demo', label: 'Try it', icon: Play },
  { id: 'mistake', label: 'Typical mistake', icon: AlertTriangle },
  { id: 'exercise', label: 'Exercise', icon: PenLine },
  { id: 'quiz', label: 'Knowledge check', icon: ListChecks }
];

/** Share of knowledge-check questions that must be answered correctly to complete a concept. */
export const QUIZ_PASS_SHARE = 2 / 3;

export default function ConceptPage() {
  const { conceptId } = useParams();
  const concept = conceptId ? getConcept(conceptId) : undefined;
  if (!concept) return <Navigate to="/learn" replace />;
  return <ConceptView key={concept.id} concept={concept} />;
}

function ConceptView({ concept }: { concept: Concept }) {
  const [step, setStep] = useState<Step>('explain');
  const { progress, completeConcept } = useProgress();
  const level = LEVELS.find((l) => l.level === concept.level)!;
  const prev = previousConcept(concept.id);
  const next = nextConcept(concept.id);
  const index = STEPS.findIndex((s) => s.id === step);

  const exerciseSolved = !!progress.exercises[exerciseKey(concept)];
  const quiz = progress.quiz[concept.id];
  const quizPassed = !!quiz && quiz.total > 0 && quiz.correct / quiz.total >= QUIZ_PASS_SHARE - 1e-9;
  const completed = progress.completedConcepts.includes(concept.id);

  useEffect(() => {
    if (!completed && exerciseSolved && quizPassed) completeConcept(concept.id);
  }, [completed, exerciseSolved, quizPassed, completeConcept, concept.id]);

  const visited = (s: Step) => (s === 'exercise' ? exerciseSolved : s === 'quiz' ? quizPassed : STEPS.findIndex((x) => x.id === s) < index);

  return (
    <div className="page">
      <div className="page-narrow">
        <div className="page-header">
          <div>
            <div className="eyebrow">
              <Link to="/learn">Learning path</Link> · Level {level.level}: {level.title}
            </div>
            <h1 className="row" style={{ gap: 10 }}>
              {concept.title}
              {completed && (
                <span className="badge badge-success">
                  <CheckCircle2 size={13} /> Completed
                </span>
              )}
            </h1>
            <p>{concept.summary}</p>
          </div>
        </div>

        <div className="lesson-steps" role="tablist" aria-label="Lesson steps">
          {STEPS.map((s) => (
            <button key={s.id} role="tab" aria-selected={s.id === step} className={`lesson-step${s.id === step ? ' active' : ''}${s.id !== step && visited(s.id) ? ' done' : ''}`} onClick={() => setStep(s.id)}>
              {s.id !== step && visited(s.id) ? <CheckCircle2 size={14} aria-hidden /> : <s.icon size={14} aria-hidden />}
              {s.label}
            </button>
          ))}
        </div>

        <div className="card" role="tabpanel" aria-label={STEPS[index].label}>
          {step === 'explain' && (
            <>
              <RichText text={concept.explanation} />
              {concept.encyclopedia.length > 0 && (
                <div className="chip-row" style={{ marginTop: 12 }}>
                  <span className="subtle">Elements in the encyclopedia:</span>
                  {concept.encyclopedia.map((id) => {
                    const e = getEntry(id);
                    return e ? (
                      <Link key={id} className="chip" to={`/encyclopedia/${id}`}>
                        {e.name}
                      </Link>
                    ) : null;
                  })}
                </div>
              )}
            </>
          )}
          {step === 'example' && <DiagramStep spec={concept.example.spec} text={concept.example.caption} label={`${concept.title}: example`} />}
          {step === 'demo' && (
            <>
              <Callout title="Interactive demonstration">
                <RichText text={concept.demo.hint} />
              </Callout>
              <DiagramStep spec={concept.demo.spec} animate label={`${concept.title}: interactive demonstration`} height={340} />
              <p className="subtle" style={{ marginTop: 8 }}>
                Press <strong>Start</strong>, then click a start event to create a token. At decisions, click the gateway to choose the outgoing flow. Step mode lets you complete
                activities one at a time.
              </p>
            </>
          )}
          {step === 'mistake' && (
            <>
              <Callout kind="warning" title={concept.mistake.title}>
                <RichText text={concept.mistake.text} />
              </Callout>
              <DiagramStep spec={concept.mistake.spec} animate label={`${concept.title}: typical mistake`} height={320} />
              <p className="subtle" style={{ marginTop: 8 }}>
                Run the animation to see the consequence, or open the model in the modeler to see what the validator reports.
              </p>
            </>
          )}
          {step === 'exercise' && <ExerciseView concept={concept} />}
          {step === 'quiz' && (
            <>
              <QuizView concept={concept} />
              <div style={{ marginTop: 12 }}>
                {completed ? (
                  <Callout kind="success" title="Concept completed">
                    {next ? (
                      <>
                        Continue with <Link to={`/learn/${next.id}`}>{next.title}</Link>.
                      </>
                    ) : (
                      'You have completed the whole learning path. Try the challenges next.'
                    )}
                  </Callout>
                ) : (
                  <Callout title="How to complete this concept">
                    Solve the exercise {exerciseSolved ? '(done)' : ''} and answer at least {Math.ceil(concept.quiz.length * QUIZ_PASS_SHARE)} of {concept.quiz.length} knowledge-check questions correctly
                    {quizPassed ? ' (done)' : ''}.
                  </Callout>
                )}
              </div>
            </>
          )}
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn" onClick={() => setStep(STEPS[index - 1].id)} disabled={index === 0}>
            <ArrowLeft size={15} /> Back
          </button>
          <span className="spacer" />
          {index < STEPS.length - 1 ? (
            <button className="btn btn-primary" onClick={() => setStep(STEPS[index + 1].id)}>
              {STEPS[index + 1].label} <ArrowRight size={15} />
            </button>
          ) : next ? (
            <Link className="btn btn-primary" to={`/learn/${next.id}`}>
              Next concept: {next.title} <ArrowRight size={15} />
            </Link>
          ) : (
            <Link className="btn btn-primary" to="/challenges">
              <Sparkles size={15} /> Go to the challenges
            </Link>
          )}
        </div>

        <nav className="row subtle" style={{ marginTop: 20 }} aria-label="Concept navigation">
          {prev && (
            <Link to={`/learn/${prev.id}`}>
              <ArrowLeft size={13} /> {prev.title}
            </Link>
          )}
          <span className="spacer" />
          {next && (
            <Link to={`/learn/${next.id}`}>
              {next.title} <ArrowRight size={13} />
            </Link>
          )}
        </nav>
      </div>
    </div>
  );
}

function DiagramStep({ spec, text, animate = false, label, height = 300 }: { spec: Concept['example']['spec']; text?: string; animate?: boolean; label: string; height?: number }) {
  const xml = useMemo(() => buildBpmnXml(spec), [spec]);
  return (
    <div className="stack" style={{ gap: 10, marginTop: animate ? 12 : 0 }}>
      <BpmnViewer xml={xml} animate={animate} height={height} ariaLabel={label} />
      {text && <RichText text={text} />}
    </div>
  );
}
