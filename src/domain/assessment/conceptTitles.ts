/**
 * Concept titles used in assessment feedback. Kept in the domain layer so the
 * assessment engine does not depend on the lesson content module.
 */
const TITLES: Record<string, string> = {
  'process-basics': 'Processes and activities',
  'events-basics': 'Events',
  'sequence-flows': 'Sequence flows',
  'process-structure': 'Basic process structure',
  'xor-gateway': 'Exclusive gateways',
  'conditional-routing': 'Conditional routing',
  'default-flows': 'Default flows',
  'and-gateway': 'Parallel gateways',
  'or-gateway': 'Inclusive gateways',
  'event-based-gateway': 'Event-based gateways',
  synchronization: 'Synchronization',
  loops: 'Loops',
  deadlocks: 'Deadlocks',
  'pools-lanes': 'Pools and lanes',
  'message-flows': 'Message flows',
  interorganizational: 'Interorganizational processes',
  subprocesses: 'Sub-processes',
  'boundary-events': 'Boundary events',
  'error-handling': 'Error handling',
  'timer-events': 'Timer events',
  escalations: 'Escalations',
  compensation: 'Compensation concepts'
};

export function getConceptTitle(id: string): string {
  return TITLES[id] ?? id;
}
