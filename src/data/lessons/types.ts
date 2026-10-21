import type { DiagramSpec } from '../../domain/bpmn/builder';

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  /** Indices of correct options (several = multiple choice). */
  correct: number[];
  explanation: string;
}

export type Exercise =
  | {
      kind: 'mcq';
      id: string;
      prompt: string;
      spec?: DiagramSpec;
      options: string[];
      correct: number[];
      explanation: string;
    }
  | {
      kind: 'click';
      id: string;
      prompt: string;
      spec: DiagramSpec;
      /** Any of these element ids is a correct answer. */
      correctIds: string[];
      explanation: string;
    }
  | {
      kind: 'predict';
      id: string;
      prompt: string;
      spec: DiagramSpec;
      /** Gateway decisions of the scenario (see runTokenGame). */
      choices?: Record<string, string[]>;
      triggeredBoundaries?: string[];
      /** Activities offered as answer options. */
      candidates: string[];
      explanation: string;
    };

export interface Concept {
  id: string;
  title: string;
  level: number;
  summary: string;
  /** Short explanation (rich text). */
  explanation: string;
  example: { spec: DiagramSpec; caption: string };
  demo: { spec: DiagramSpec; hint: string };
  mistake: { spec: DiagramSpec; title: string; text: string };
  exercise: Exercise;
  quiz: QuizQuestion[];
  encyclopedia: string[];
}

export interface Level {
  level: number;
  title: string;
  description: string;
  concepts: Concept[];
}
