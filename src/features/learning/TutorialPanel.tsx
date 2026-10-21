import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Circle, Lightbulb, PartyPopper, X } from 'lucide-react';
import type { ProcessGraph } from '../../domain/bpmn/graph';
import type { ValidationReport } from '../../domain/validation/types';
import type { SimSnapshot } from '../token-simulation/controller';
import { getTutorial, type TutorialObservations } from '../../data/tutorials';
import { useProgress } from '../../app/progress';
import { ProgressBar, RichText } from '../../components/ui';

export function TutorialPanel({
  tutorialId,
  graph,
  report,
  sim,
  onClose
}: {
  tutorialId: string;
  graph: ProcessGraph | null;
  report: ValidationReport | null;
  sim: SimSnapshot | null;
  onClose: () => void;
}) {
  const tutorial = getTutorial(tutorialId);
  const { progress, recordTutorial } = useProgress();
  const seen = useRef<TutorialObservations>({ instancesCompleted: 0, decisions: new Set(), joinWaitSeen: false });
  const [tick, setTick] = useState(0);
  const [showHint, setShowHint] = useState(false);

  // accumulate observations from the token simulation
  useEffect(() => {
    if (!sim) return;
    let changed = false;
    if (sim.instancesCompleted > seen.current.instancesCompleted) {
      seen.current.instancesCompleted = sim.instancesCompleted;
      changed = true;
    }
    for (const d of sim.decisions) {
      if (!seen.current.decisions.has(d.flowId)) {
        seen.current.decisions.add(d.flowId);
        changed = true;
      }
    }
    if (!seen.current.joinWaitSeen && sim.tokens.some((t) => t.state === 'waiting-join') && sim.status !== 'blocked') {
      seen.current.joinWaitSeen = true;
      changed = true;
    }
    if (changed) setTick((t) => t + 1);
  }, [sim]);

  const stored = progress.tutorials[tutorialId]?.completedSteps ?? [];
  const status = useMemo(() => {
    if (!tutorial || !graph) return [];
    return tutorial.steps.map((s) => {
      let ok = false;
      try {
        ok = s.check({ graph, report, seen: seen.current });
      } catch {
        ok = false;
      }
      return ok;
    });
    // tick forces re-evaluation of simulation-based checks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorial, graph, report, tick]);

  // steps are completed in order; once completed they stay completed
  const completed = useMemo(() => {
    const result: boolean[] = [];
    let allBefore = true;
    tutorial?.steps.forEach((s, i) => {
      const ok = allBefore && (status[i] || stored.includes(s.id));
      result.push(ok);
      allBefore = allBefore && ok;
    });
    return result;
  }, [status, stored, tutorial]);

  const doneCount = completed.filter(Boolean).length;
  const done = tutorial ? doneCount === tutorial.steps.length : false;

  useEffect(() => {
    if (!tutorial) return;
    const ids = tutorial.steps.filter((_, i) => completed[i]).map((s) => s.id);
    const newOnes = ids.filter((id) => !stored.includes(id));
    if (newOnes.length) {
      recordTutorial(tutorial.id, ids, ids.length === tutorial.steps.length);
      setShowHint(false);
    }
  }, [completed, tutorial, stored, recordTutorial]);

  if (!tutorial) return null;
  const currentIndex = completed.findIndex((c) => !c);

  return (
    <div className="tutorial-panel">
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="eyebrow" style={{ margin: 0 }}>
          Guided tutorial
        </span>
        <span className="spacer" />
        <button className="btn btn-sm btn-ghost btn-icon" onClick={onClose} aria-label="Close tutorial">
          <X size={14} />
        </button>
      </div>
      <h3 style={{ marginBottom: 4 }}>{tutorial.title}</h3>
      <ProgressBar value={doneCount / tutorial.steps.length} label="Tutorial progress" />
      <ol className="tutorial-steps">
        {tutorial.steps.map((s, i) => (
          <li key={s.id} className={completed[i] ? 'done' : i === currentIndex ? 'current' : ''}>
            {completed[i] ? <CheckCircle2 size={16} color="var(--success)" aria-label="done" /> : <Circle size={16} aria-label="open" />}
            <div>
              <strong>{s.title}</strong>
              {i === currentIndex && (
                <>
                  <RichText text={s.instruction} />
                  {showHint ? (
                    <p className="subtle">
                      <Lightbulb size={12} /> {s.hint}
                    </p>
                  ) : (
                    <button className="btn btn-sm btn-ghost" onClick={() => setShowHint(true)}>
                      <Lightbulb size={14} /> Hint
                    </button>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
      {done && (
        <div className="callout callout-success">
          <PartyPopper size={18} color="var(--success)" />
          <div>
            <strong>Tutorial completed!</strong> You can keep improving the model or continue with the learning path.
          </div>
        </div>
      )}
    </div>
  );
}
