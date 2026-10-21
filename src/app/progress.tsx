import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AssessmentResult, LearnerProgress } from '../domain/contracts';
import { emptyProgress } from '../domain/contracts';
import { getProgress, saveProgress } from '../storage/db';
import { BADGES, newlyEarnedBadges } from '../data/badges';
import { useToast } from './toast';

interface ProgressContextValue {
  progress: LearnerProgress;
  loaded: boolean;
  completeConcept: (conceptId: string) => void;
  recordQuiz: (conceptId: string, correct: number, total: number) => void;
  recordExercise: (exerciseId: string, ok: boolean) => void;
  recordChallenge: (challengeId: string, result: AssessmentResult, hintsUsed: number) => void;
  recordTutorial: (tutorialId: string, completedSteps: string[], done: boolean) => void;
  recordExperiment: () => void;
  reset: () => void;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<LearnerProgress>(emptyProgress);
  const [loaded, setLoaded] = useState(false);
  const notify = useToast();
  const ref = useRef(progress);
  ref.current = progress;

  useEffect(() => {
    getProgress()
      .then((p) => {
        setProgress({ ...emptyProgress(), ...p });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const update = useCallback(
    (fn: (p: LearnerProgress) => LearnerProgress) => {
      const next = fn(structuredClone(ref.current));
      const earned = newlyEarnedBadges(next);
      if (earned.length) {
        next.badges = [...next.badges, ...earned];
        for (const id of earned) {
          const b = BADGES.find((x) => x.id === id);
          if (b) notify(`Badge earned: ${b.name}`, { kind: 'success', message: b.description, ttl: 5000 });
        }
      }
      ref.current = next;
      setProgress(next);
      saveProgress(next).catch(() => undefined);
    },
    [notify]
  );

  const value = useMemo<ProgressContextValue>(
    () => ({
      progress,
      loaded,
      completeConcept: (id) =>
        update((p) => {
          if (!p.completedConcepts.includes(id)) p.completedConcepts.push(id);
          return p;
        }),
      recordQuiz: (id, correct, total) =>
        update((p) => {
          const prev = p.quiz[id];
          if (!prev || correct >= prev.correct) p.quiz[id] = { correct, total, at: new Date().toISOString() };
          return p;
        }),
      recordExercise: (id, ok) =>
        update((p) => {
          p.exercises[id] = p.exercises[id] || ok;
          return p;
        }),
      recordChallenge: (id, result, hintsUsed) =>
        update((p) => {
          const prev = p.challenges[id];
          p.challenges[id] = {
            status: prev?.status === 'passed' || result.passed ? 'passed' : 'attempted',
            attempts: (prev?.attempts ?? 0) + 1,
            hintsUsed: Math.max(prev?.hintsUsed ?? 0, hintsUsed),
            bestScore: Math.max(prev?.bestScore ?? 0, result.score),
            at: new Date().toISOString()
          };
          return p;
        }),
      recordTutorial: (id, steps, done) =>
        update((p) => {
          const prev = p.tutorials[id];
          p.tutorials[id] = { completedSteps: [...new Set([...(prev?.completedSteps ?? []), ...steps])], done: prev?.done || done };
          return p;
        }),
      recordExperiment: () =>
        update((p) => {
          p.experiments = (p.experiments ?? 0) + 1;
          return p;
        }),
      reset: () => update(() => emptyProgress())
    }),
    [progress, loaded, update]
  );

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress outside ProgressProvider');
  return ctx;
}
