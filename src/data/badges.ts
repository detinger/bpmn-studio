import type { LearnerProgress } from '../domain/contracts';
import { LEVELS } from './lessons';
import { CHALLENGES } from './challenges';

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  earned: (p: LearnerProgress) => boolean;
}

const levelDone = (level: number) => (p: LearnerProgress) => {
  const l = LEVELS.find((x) => x.level === level);
  return !!l && l.concepts.every((c) => p.completedConcepts.includes(c.id));
};

const passedChallengeOfType = (type: string) => (p: LearnerProgress) =>
  CHALLENGES.some((c) => c.type === type && p.challenges[c.id]?.status === 'passed');

export const BADGES: BadgeDefinition[] = [
  { id: 'first-model', name: 'First model', description: 'Completed the guided tutorial “Your first process”.', icon: 'PenTool', earned: (p) => !!p.tutorials['first-process']?.done },
  { id: 'fundamentals', name: 'Fundamentals', description: 'Completed Level 1 — processes, events and sequence flows.', icon: 'Footprints', earned: levelDone(1) },
  { id: 'decision-maker', name: 'Decision maker', description: 'Completed Level 2 — exclusive and parallel gateways.', icon: 'GitFork', earned: levelDone(2) },
  { id: 'flow-controller', name: 'Flow controller', description: 'Completed Level 3 — inclusive, event-based gateways, loops and deadlocks.', icon: 'Workflow', earned: levelDone(3) },
  { id: 'collaborator', name: 'Collaborator', description: 'Completed Level 4 — pools, lanes and message flows.', icon: 'Users', earned: levelDone(4) },
  { id: 'advanced-modeler', name: 'Advanced modeler', description: 'Completed Level 5 — sub-processes, boundary events and exceptions.', icon: 'Layers', earned: levelDone(5) },
  { id: 'sharp-mind', name: 'Sharp mind', description: 'Answered every question of a knowledge check correctly.', icon: 'Brain', earned: (p) => Object.values(p.quiz).some((q) => q.total > 0 && q.correct === q.total) },
  { id: 'architect', name: 'Architect', description: 'Solved a “Build a process” challenge.', icon: 'Building2', earned: passedChallengeOfType('build') },
  { id: 'bug-hunter', name: 'Bug hunter', description: 'Repaired a broken model.', icon: 'Bug', earned: passedChallengeOfType('fix') },
  { id: 'fortune-teller', name: 'Fortune teller', description: 'Predicted an execution correctly.', icon: 'Sparkles', earned: passedChallengeOfType('predict') },
  { id: 'deadlock-detective', name: 'Deadlock detective', description: 'Found the cause of a deadlock.', icon: 'Search', earned: passedChallengeOfType('deadlock') },
  { id: 'optimizer', name: 'Optimizer', description: 'Improved a process to meet its performance targets.', icon: 'TrendingUp', earned: passedChallengeOfType('improve') },
  { id: 'analyst', name: 'Analyst', description: 'Chose the better alternative based on simulation evidence.', icon: 'Scale', earned: passedChallengeOfType('compare') },
  { id: 'experimenter', name: 'Experimenter', description: 'Ran five performance simulation experiments.', icon: 'FlaskConical', earned: (p) => p.experiments >= 5 }
];

export function newlyEarnedBadges(p: LearnerProgress): string[] {
  return BADGES.filter((b) => !p.badges.includes(b.id) && b.earned(p)).map((b) => b.id);
}
