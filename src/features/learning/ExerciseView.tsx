/** The short exercise of a concept: multiple choice, "click the element" or "predict the execution". */
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import type { Concept } from '../../data/lessons';
import { BpmnViewer } from '../../components/BpmnViewer';
import { Callout, RichText } from '../../components/ui';
import { buildBpmnXml } from '../../domain/bpmn/builder';
import { parseBpmnXml } from '../../domain/bpmn/parse';
import { displayName, type ProcessGraph } from '../../domain/bpmn/graph';
import { runTokenGame } from '../../domain/bpmn/behavior';
import { useProgress } from '../../app/progress';

export const exerciseKey = (c: Concept) => `${c.id}/${c.exercise.id}`;

type Highlight = NonNullable<Parameters<typeof BpmnViewer>[0]['highlights']>[number];

export function ExerciseView({ concept }: { concept: Concept }) {
  const ex = concept.exercise;
  const { progress, recordExercise } = useProgress();
  const xml = useMemo(() => (ex.spec ? buildBpmnXml(ex.spec) : null), [ex]);
  const [graph, setGraph] = useState<ProcessGraph | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [checked, setChecked] = useState<boolean | null>(null);
  const [watch, setWatch] = useState(false);
  const solvedBefore = !!progress.exercises[exerciseKey(concept)];

  useEffect(() => {
    if (!xml) return;
    let cancelled = false;
    parseBpmnXml(xml).then(({ graph: g }) => !cancelled && setGraph(g));
    return () => {
      cancelled = true;
    };
  }, [xml]);

  const expected = useMemo(() => {
    if (ex.kind !== 'predict' || !graph) return null;
    const r = runTokenGame(graph, graph.rootScopeIds[0], { choices: ex.choices, triggeredBoundaries: ex.triggeredBoundaries });
    return ex.candidates.filter((id) => r.trace.includes(id));
  }, [ex, graph]);

  const name = (id: string) => (graph ? displayName(graph, id) : id);
  const multi = ex.kind === 'predict' || (ex.kind === 'mcq' && ex.correct.length > 1);

  const toggle = (value: string) => {
    if (checked !== null) return;
    setSelected((s) => (multi ? (s.includes(value) ? s.filter((x) => x !== value) : [...s, value]) : [value]));
  };

  const check = () => {
    let ok = false;
    if (ex.kind === 'mcq') ok = sameSet(selected.map(Number), ex.correct);
    else if (ex.kind === 'click') ok = selected.length === 1 && ex.correctIds.includes(selected[0]);
    else if (expected) ok = sameSet(selected, expected);
    setChecked(ok);
    recordExercise(exerciseKey(concept), ok);
  };

  const retry = () => {
    setChecked(null);
    setSelected([]);
    setWatch(false);
  };

  const highlights = useMemo<Highlight[]>(() => {
    if (ex.kind === 'click') {
      if (checked === null) return selected.length ? [{ ids: selected, kind: 'element' }] : [];
      return [
        { ids: ex.correctIds, kind: 'success' },
        { ids: selected.filter((id) => !ex.correctIds.includes(id)), kind: 'error' }
      ];
    }
    if (ex.kind === 'predict' && checked !== null && expected) {
      return [
        { ids: expected, kind: 'success' },
        { ids: selected.filter((id) => !expected.includes(id)), kind: 'error' }
      ];
    }
    return [];
  }, [ex, selected, checked, expected]);

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row">
        <h3 style={{ margin: 0 }}>Exercise</h3>
        <span className="spacer" />
        {solvedBefore && <span className="badge badge-success">Solved</span>}
      </div>
      <p style={{ margin: 0 }}>{ex.prompt}</p>

      {xml && (
        <BpmnViewer
          key={watch ? 'watch' : 'static'}
          xml={xml}
          animate={watch}
          height={300}
          onElementClick={ex.kind === 'click' && checked === null ? (id) => graph?.nodes[id] && setSelected([id]) : undefined}
          highlights={watch ? undefined : highlights}
          ariaLabel="Exercise diagram"
        />
      )}

      {ex.kind === 'click' && (
        <div className="subtle">{selected.length ? <>Selected: <strong>{name(selected[0])}</strong></> : 'Click an element in the diagram.'}</div>
      )}

      {ex.kind === 'mcq' && (
        <div role={multi ? 'group' : 'radiogroup'} aria-label="Answer options">
          {multi && <div className="subtle" style={{ marginBottom: 6 }}>Select all that apply.</div>}
          {ex.options.map((o, i) => (
            <OptionRow key={i} label={o} type={multi ? 'checkbox' : 'radio'} name={ex.id} selected={selected.includes(String(i))} result={checked === null ? undefined : ex.correct.includes(i)} onToggle={() => toggle(String(i))} />
          ))}
        </div>
      )}

      {ex.kind === 'predict' && (
        <div role="group" aria-label="Activities">
          <div className="subtle" style={{ marginBottom: 6 }}>Select every activity that will be executed.</div>
          {ex.candidates.map((id) => (
            <OptionRow key={id} label={name(id)} type="checkbox" name={ex.id} selected={selected.includes(id)} result={checked === null || !expected ? undefined : expected.includes(id)} onToggle={() => toggle(id)} />
          ))}
        </div>
      )}

      {checked === null ? (
        <div>
          <button className="btn btn-primary" onClick={check} disabled={!selected.length || (ex.kind === 'predict' && !expected)}>
            Check answer
          </button>
        </div>
      ) : (
        <>
          <Callout kind={checked ? 'success' : 'error'} title={checked ? 'Correct!' : 'Not quite.'}>
            <RichText text={ex.explanation} />
          </Callout>
          <div className="row">
            <button className="btn" onClick={retry}>
              <RotateCcw size={14} /> Try again
            </button>
            {ex.kind === 'predict' && !watch && (
              <button className="btn" onClick={() => setWatch(true)}>
                Watch the token simulation
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function OptionRow({
  label,
  type,
  name,
  selected,
  result,
  onToggle
}: {
  label: string;
  type: 'radio' | 'checkbox';
  name: string;
  selected: boolean;
  /** After checking: whether this option is a correct answer. */
  result?: boolean;
  onToggle: () => void;
}) {
  const state = result === undefined ? (selected ? ' selected' : '') : result ? ' correct' : selected ? ' wrong' : '';
  return (
    <label className={`quiz-option${state}`}>
      <input type={type} name={name} checked={selected} onChange={onToggle} disabled={result !== undefined} />
      <span style={{ flex: 1 }}>{label}</span>
      {result === true && <CheckCircle2 size={16} color="var(--success)" aria-label="correct answer" />}
      {result === false && selected && <XCircle size={16} color="var(--error)" aria-label="wrong answer" />}
    </label>
  );
}

export function sameSet<T>(a: T[], b: T[]) {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}
