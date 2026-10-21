import type { Concept, Level } from './types';
import { LEVEL1, LEVEL2 } from './level1-2';
import { LEVEL3 } from './level3';
import { LEVEL4, LEVEL5 } from './level4-5';

export type { Concept, Level, Exercise, QuizQuestion } from './types';

export const LEVELS: Level[] = [
  { level: 1, title: 'Fundamentals', description: 'Processes, activities, events, sequence flows and the basic structure of a process model.', concepts: LEVEL1 },
  { level: 2, title: 'Decisions', description: 'Exclusive gateways, conditional routing, default flows and parallel gateways.', concepts: LEVEL2 },
  { level: 3, title: 'Advanced control flow', description: 'Inclusive and event-based gateways, synchronization, loops and deadlocks.', concepts: LEVEL3 },
  { level: 4, title: 'Collaboration', description: 'Pools and lanes, message flows and processes across organizations.', concepts: LEVEL4 },
  { level: 5, title: 'Advanced BPMN', description: 'Sub-processes, boundary events, error handling, timers, escalations and compensation.', concepts: LEVEL5 }
];

export const ALL_CONCEPTS: Concept[] = LEVELS.flatMap((l) => l.concepts);

export function getConcept(id: string): Concept | undefined {
  return ALL_CONCEPTS.find((c) => c.id === id);
}

export function nextConcept(id: string): Concept | undefined {
  const i = ALL_CONCEPTS.findIndex((c) => c.id === id);
  return i >= 0 ? ALL_CONCEPTS[i + 1] : undefined;
}

export function previousConcept(id: string): Concept | undefined {
  const i = ALL_CONCEPTS.findIndex((c) => c.id === id);
  return i > 0 ? ALL_CONCEPTS[i - 1] : undefined;
}
