import type { DiagramSpec } from '../bpmn/builder';
import type { SimulationPreset } from '../simulation/preset';
import type { AssessmentDimension } from '../contracts';
import type { Distribution } from '../simulation/distributions';

/** A role is a business activity identified by keywords in element names (model-independent). */
export interface Role {
  id: string;
  label: string;
  keywords: string[];
  kinds?: Array<'activity' | 'event' | 'start' | 'end' | 'gateway'>;
}

export type Criterion =
  | { kind: 'role'; role: string; weight?: number }
  | { kind: 'gateway'; gateway: 'exclusive' | 'parallel' | 'inclusive' | 'eventBased'; min: number; label: string; weight?: number }
  | { kind: 'endEvents'; min: number; weight?: number }
  | { kind: 'sound'; weight?: number }
  | { kind: 'noErrors'; weight?: number }
  | { kind: 'always'; role: string; weight?: number }
  | { kind: 'optional'; role: string; weight?: number }
  | { kind: 'exclusive'; roles: [string, string]; weight?: number }
  | { kind: 'precedes'; before: string; after: string; weight?: number }
  | { kind: 'concurrent'; roles: [string, string]; weight?: number }
  | { kind: 'boundary'; role: string; event: 'timer' | 'error' | 'message' | 'escalation' | 'signal' | 'conditional'; interrupting?: boolean; weight?: number }
  | { kind: 'pools'; min: number; weight?: number }
  | { kind: 'messageFlows'; min: number; weight?: number };

export type ChallengeType = 'build' | 'fix' | 'predict' | 'deadlock' | 'improve' | 'compare';

export interface ChallengeBase {
  id: string;
  type: ChallengeType;
  title: string;
  level: 1 | 2 | 3 | 4 | 5;
  minutes: number;
  summary: string;
  /** Business scenario (rich text). */
  scenario: string;
  hints: string[];
  /** Concepts to study when the challenge is not passed. */
  concepts: string[];
}

export interface ModelChallenge extends ChallengeBase {
  type: 'build' | 'fix';
  start?: DiagramSpec;
  roles: Role[];
  criteria: Criterion[];
}

export interface PerformanceTarget {
  metric: 'cycleTime' | 'cycleTimeP90' | 'waitingTime' | 'costPerCase' | 'slaCompliance' | 'maxUtilization';
  op: '<=' | '>=';
  value: number;
  label: string;
}

export interface ImproveChallenge extends ChallengeBase {
  type: 'improve';
  start: DiagramSpec;
  sim: SimulationPreset;
  roles: Role[];
  criteria: Criterion[];
  /** Durations used during assessment, per role; an automated variant applies when the role is a service/script task. */
  roleDurations: Record<string, { duration: Distribution; automated?: Distribution }>;
  defaultDuration: Distribution;
  maxWorkers: number;
  targets: PerformanceTarget[];
}

export interface PredictScenario {
  id: string;
  description: string;
  choices?: Record<string, string[]>;
  triggeredBoundaries?: string[];
}

export interface PredictChallenge extends ChallengeBase {
  type: 'predict';
  spec: DiagramSpec;
  candidates: string[];
  scenarios: PredictScenario[];
}

export interface DeadlockChallenge extends ChallengeBase {
  type: 'deadlock';
  spec: DiagramSpec;
  question: string;
  options: string[];
  correctOption: number;
}

export interface CompareAlternative {
  id: string;
  name: string;
  description: string;
  spec: DiagramSpec;
  sim: SimulationPreset;
}

export interface CompareChallenge extends ChallengeBase {
  type: 'compare';
  alternatives: [CompareAlternative, CompareAlternative];
  metric: 'cycleTime' | 'waitingTime' | 'costPerCase' | 'slaCompliance';
  better: 'lower' | 'higher';
  question: string;
  reasons: Array<{ text: string; correctFor: string | null }>;
}

export type Challenge = ModelChallenge | ImproveChallenge | PredictChallenge | DeadlockChallenge | CompareChallenge;

export const CHALLENGE_TYPE_LABEL: Record<ChallengeType, string> = {
  build: 'Build a process',
  fix: 'Fix a broken model',
  predict: 'Predict execution',
  deadlock: 'Find a deadlock',
  improve: 'Improve a process',
  compare: 'Compare alternatives'
};

export const DIMENSION_LABEL: Record<AssessmentDimension, string> = {
  structure: 'Structural correctness',
  behavior: 'Required behavior',
  semantics: 'BPMN semantic correctness',
  scenario: 'Scenario coverage',
  performance: 'Process performance',
  reasoning: 'Reasoning quality'
};
