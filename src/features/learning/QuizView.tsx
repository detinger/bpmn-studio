/** Knowledge check of a concept. Answers are explained after submitting; retries are allowed. */
import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { Concept } from '../../data/lessons';
import { useProgress } from '../../app/progress';
import { Callout, RichText } from '../../components/ui';
import { OptionRow, sameSet } from './ExerciseView';

export function QuizView({ concept }: { concept: Concept }) {
  const { progress, recordQuiz } = useProgress();
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [submitted, setSubmitted] = useState(false);
  const best = progress.quiz[concept.id];

  const isCorrect = (q: Concept['quiz'][number]) => sameSet(answers[q.id] ?? [], q.correct);
  const score = concept.quiz.filter(isCorrect).length;
  const complete = concept.quiz.every((q) => (answers[q.id] ?? []).length > 0);

  const toggle = (qid: string, i: number, multi: boolean) => {
    if (submitted) return;
    setAnswers((a) => {
      const cur = a[qid] ?? [];
      return { ...a, [qid]: multi ? (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]) : [i] };
    });
  };

  const submit = () => {
    setSubmitted(true);
    recordQuiz(concept.id, score, concept.quiz.length);
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row">
        <h3 style={{ margin: 0 }}>Knowledge check</h3>
        <span className="spacer" />
        {best && (
          <span className="subtle">
            Best result: {best.correct} / {best.total}
          </span>
        )}
      </div>
      {concept.quiz.map((q, n) => {
        const multi = q.correct.length > 1;
        return (
          <fieldset key={q.id} style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={{ fontWeight: 600, marginBottom: 6 }}>
              {n + 1}. {q.question}
              {multi && <span className="subtle"> (select all that apply)</span>}
            </legend>
            {q.options.map((o, i) => (
              <OptionRow
                key={i}
                label={o}
                type={multi ? 'checkbox' : 'radio'}
                name={`${concept.id}-${q.id}`}
                selected={(answers[q.id] ?? []).includes(i)}
                result={submitted ? q.correct.includes(i) : undefined}
                onToggle={() => toggle(q.id, i, multi)}
              />
            ))}
            {submitted && (
              <Callout kind={isCorrect(q) ? 'success' : 'error'}>
                <strong>{isCorrect(q) ? 'Correct. ' : 'Not quite. '}</strong>
                <RichText text={q.explanation} />
              </Callout>
            )}
          </fieldset>
        );
      })}
      {submitted ? (
        <div className="row">
          <strong>
            {score} of {concept.quiz.length} correct
          </strong>
          <span className="spacer" />
          <button
            className="btn"
            onClick={() => {
              setSubmitted(false);
              setAnswers({});
            }}
          >
            <RotateCcw size={14} /> Try again
          </button>
        </div>
      ) : (
        <div>
          <button className="btn btn-primary" onClick={submit} disabled={!complete}>
            Submit answers
          </button>
          {!complete && <span className="subtle" style={{ marginLeft: 10 }}>Answer every question to submit.</span>}
        </div>
      )}
    </div>
  );
}
