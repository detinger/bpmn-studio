/**
 * Versioned data contracts shared across BPMN Studio modules and with
 * external tools (Process Mining Detective, Process Digital Twin Studio).
 *
 * Each contract has a `schemaVersion` and a JSON Schema in
 * src/domain/contracts/schemas/. Breaking changes require a new version.
 */
import type { SimulationConfig } from '../simulation/config';
import type { KpiEstimates, ActivityEstimate, PoolEstimate } from '../simulation/experiment';
import type { SupportReport } from '../simulation/support';

export { SIMULATION_CONFIG_SCHEMA_VERSION } from '../simulation/config';
export type { SimulationConfig } from '../simulation/config';
export { SIMULATION_RUN_SCHEMA_VERSION } from '../simulation/experiment';
export type { SimulationRun } from '../simulation/experiment';
export { EVENT_LOG_SCHEMA_VERSION } from '../simulation/eventLog';

export const PROCESS_MODEL_SCHEMA_VERSION = 1 as const;
export const ASSESSMENT_SCHEMA_VERSION = 1 as const;
export const SCENARIO_SCHEMA_VERSION = 1 as const;

/** Process model metadata. The BPMN 2.0 XML itself is stored alongside, unmodified. */
export interface ProcessModelMetadata {
  schemaVersion: typeof PROCESS_MODEL_SCHEMA_VERSION;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  /** Incremented whenever the BPMN XML changes. */
  version: number;
  role?: 'as-is' | 'to-be';
  /** Links an AS-IS model with its TO-BE alternatives. */
  pairId?: string;
  baseDiagramId?: string;
  origin: { kind: 'blank' | 'example' | 'challenge' | 'import' | 'duplicate' | 'tutorial'; ref?: string };
  tags: string[];
}

/** Persisted summary of a simulation run (event logs are exported, not stored). */
export interface StoredRunSummary {
  schemaVersion: 1;
  runId: string;
  diagramId: string;
  modelName: string;
  modelVersion: number;
  configVersion: number;
  seed: number;
  replicationCount: number;
  createdAt: string;
  config: SimulationConfig;
  support: SupportReport;
  kpis: KpiEstimates;
  activities: Record<string, ActivityEstimate>;
  pools: Record<string, PoolEstimate>;
  warnings: string[];
  /** Cycle time samples of the first replication (for distribution comparisons). */
  cycleTimeSample: number[];
  waitingTimeSample: number[];
  cases: { measured: number; completed: number; incomplete: number; rejected: number };
}

/** Event log row (see eventLog.ts for CSV/XES serializations). */
export interface EventLogRecord {
  caseId: string;
  activity: string;
  activityId: string;
  resource: string;
  lifecycle: 'start' | 'complete' | 'ate_abort';
  timestamp: string;
}

export type CriterionStatus = 'met' | 'not-met' | 'partial' | 'not-applicable';

export interface CriterionResult {
  id: string;
  dimension: AssessmentDimension;
  label: string;
  status: CriterionStatus;
  /** Explanation of why the criterion is (not) met. */
  feedback: string;
  /** Why this matters for the process. */
  rationale?: string;
  elementIds?: string[];
  weight: number;
}

export type AssessmentDimension = 'structure' | 'behavior' | 'semantics' | 'scenario' | 'performance' | 'reasoning';

export interface AssessmentResult {
  schemaVersion: typeof ASSESSMENT_SCHEMA_VERSION;
  challengeId: string;
  submittedAt: string;
  /** 0..1 weighted score. */
  score: number;
  passed: boolean;
  criteria: CriterionResult[];
  strengths: string[];
  improvements: string[];
  nextConcept?: { conceptId: string; label: string };
}

export interface LearnerProgress {
  id: 'me';
  completedConcepts: string[];
  quiz: Record<string, { correct: number; total: number; at: string }>;
  exercises: Record<string, boolean>;
  challenges: Record<string, { status: 'attempted' | 'passed'; attempts: number; hintsUsed: number; bestScore: number; at: string }>;
  tutorials: Record<string, { completedSteps: string[]; done: boolean }>;
  badges: string[];
  experiments: number;
  updatedAt?: string;
}

export function emptyProgress(): LearnerProgress {
  return { id: 'me', completedConcepts: [], quiz: {}, exercises: {}, challenges: {}, tutorials: {}, badges: [], experiments: 0 };
}

export interface AppSettings {
  id: 'settings';
  theme: 'light' | 'dark' | 'system';
  lastDiagramId?: string;
  navCollapsed?: boolean;
  seenWelcome?: boolean;
}
