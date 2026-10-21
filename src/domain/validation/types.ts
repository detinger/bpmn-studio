export type Severity = 'error' | 'warning' | 'recommendation' | 'info';

/**
 * The validator distinguishes five layers. The first two judge the model
 * itself; executability judges the model relative to one of BPMN Studio's
 * engines; pedagogy holds advice that is not a BPMN rule at all.
 */
export type ValidationLayer = 'structure' | 'semantics' | 'control-flow' | 'executability' | 'pedagogy';

export type Evidence =
  /** Proven by exhaustive state-space exploration of the supported subset. */
  | 'formal'
  /** A structural pattern that often, but not always, indicates a problem. */
  | 'heuristic'
  /** A rule of the BPMN 2.0 specification or a modeling convention. */
  | 'rule';

export type EngineId = 'token-animation' | 'performance-simulation';

export interface LearnLink {
  conceptId: string;
  label: string;
}

export interface ValidationIssue {
  id: string;
  ruleId: string;
  source: 'bpmnlint' | 'studio';
  layer: ValidationLayer;
  severity: Severity;
  evidence: Evidence;
  elementIds: string[];
  title: string;
  /** What exactly was found. */
  explanation: string;
  /** What can go wrong because of it. */
  consequence: string;
  /** How to correct it. */
  suggestion: string;
  learnMore?: LearnLink;
  /** Execution steps that lead to the problem (formal findings). */
  witness?: string[];
  engine?: EngineId;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  counts: Record<Severity, number>;
  byLayer: Record<ValidationLayer, number>;
  analysis: {
    performed: boolean;
    sound: boolean | null;
    complete: boolean;
    stateCount: number;
    approximations: string[];
  };
  /** XML could not be parsed at all. */
  fatal?: string;
  generatedAt: string;
}

export const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, recommendation: 2, info: 3 };

export const SEVERITY_LABEL: Record<Severity, string> = {
  error: 'Error',
  warning: 'Warning',
  recommendation: 'Recommendation',
  info: 'Information'
};

export const SEVERITY_MEANING: Record<Severity, string> = {
  error: 'Invalid or unsupported model',
  warning: 'Potential behavioral or modeling problem',
  recommendation: 'Improvement opportunity',
  info: 'Educational explanation'
};

export const LAYER_LABEL: Record<ValidationLayer, string> = {
  structure: 'XML & structure',
  semantics: 'BPMN semantics',
  'control-flow': 'Control flow (behavior)',
  executability: 'Executability',
  pedagogy: 'Modeling advice'
};

export const LAYER_DESCRIPTION: Record<ValidationLayer, string> = {
  structure: 'Is the file a well-formed BPMN 2.0 model whose elements are properly connected?',
  semantics: 'Does the model respect the rules of the BPMN 2.0 specification?',
  'control-flow': 'How do tokens actually move? Deadlocks, missing synchronization, dead paths and endless loops.',
  executability: 'Can BPMN Studio’s token animation or performance simulator execute this model, and with which simplifications?',
  pedagogy: 'Conventions that make models easier to read and discuss; not BPMN errors.'
};
