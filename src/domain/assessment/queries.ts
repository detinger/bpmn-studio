/**
 * Behavioral queries over the reachable state graph of a process scope.
 *
 * They make assessment independent of the visual structure of a model:
 * different diagrams that describe the same behavior give the same answers.
 * Activities are identified by sets of node ids (a "role" may be played by
 * several elements, e.g. two tasks both named "Notify customer").
 */
import { buildStateGraph, statesThatCanComplete, type StateGraph } from '../bpmn/behavior';
import type { ProcessGraph } from '../bpmn/graph';

export class BehaviorModel {
  readonly sg: StateGraph;
  private canComplete: Set<number>;

  constructor(
    readonly graph: ProcessGraph,
    readonly scopeId: string
  ) {
    this.sg = buildStateGraph(graph, scopeId, { maxStates: 30000 });
    this.canComplete = statesThatCanComplete(this.sg);
  }

  get truncated() {
    return this.sg.truncated;
  }

  /** Product search over (state, flags). `step` returns the new flags or null to forbid the edge. */
  private search(
    initFlags: number,
    step: (flags: number, nodeId: string) => number | null,
    accept: (state: number, flags: number) => boolean
  ): boolean {
    const seen = new Set<string>();
    const stack: Array<[number, number]> = this.sg.initial.map((s) => [s, initFlags]);
    while (stack.length) {
      const [s, f] = stack.pop()!;
      const key = `${s}:${f}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (accept(s, f)) return true;
      for (const e of this.sg.edges[s]) {
        let nf: number | null = f;
        for (const id of [e.nodeId, ...(e.boundaryId ? [e.boundaryId] : [])]) {
          if (nf === null) break;
          nf = step(nf, id);
        }
        if (nf !== null) stack.push([e.to, nf]);
      }
    }
    return false;
  }

  private isFinal(s: number) {
    return this.sg.finals.has(s);
  }

  /** Every complete execution contains an element of `role`. */
  always(role: Set<string>): boolean {
    // look for a complete execution that avoids the role
    return !this.search(0, (f, id) => (role.has(id) ? null : f), (s) => this.isFinal(s));
  }

  /** Some complete execution contains the role. */
  possible(role: Set<string>): boolean {
    return this.search(0, (f, id) => (role.has(id) ? 1 : f), (s, f) => f === 1 && this.isFinal(s));
  }

  /** Some complete executions contain the role and some do not. */
  optional(role: Set<string>): boolean {
    return this.possible(role) && !this.always(role);
  }

  /** No complete execution contains both roles. */
  exclusive(a: Set<string>, b: Set<string>): boolean {
    const both = this.search(
      0,
      (f, id) => f | (a.has(id) ? 1 : 0) | (b.has(id) ? 2 : 0),
      (s, f) => f === 3 && this.isFinal(s)
    );
    return !both;
  }

  /** `after` never happens before (some element of) `before` has happened. */
  precedes(before: Set<string>, after: Set<string>): boolean {
    const violation = this.search(
      0,
      (f, id) => {
        if (before.has(id)) return 1;
        if (after.has(id) && f === 0) return 2;
        return f;
      },
      (_s, f) => f === 2
    );
    return !violation;
  }

  /** In some reachable state, an element of `a` and one of `b` are enabled at the same time. */
  concurrent(a: Set<string>, b: Set<string>): boolean {
    for (const edges of this.sg.edges) {
      let ea = false;
      let eb = false;
      for (const e of edges) {
        if (a.has(e.nodeId)) ea = true;
        if (b.has(e.nodeId)) eb = true;
      }
      if (ea && eb) return true;
    }
    return false;
  }

  /** Every reachable state can still complete. */
  get canAlwaysComplete(): boolean {
    return this.sg.states.every((_, i) => this.canComplete.has(i));
  }
}
