# Behavioral analysis

`src/domain/bpmn/behavior.ts` explores the reachable state space of a token game over the sequence flows of one process scope. The validator reports deadlocks, lack of synchronization, livelocks and dead elements only when this exploration proves them (evidence `formal`); structural patterns that merely suggest a problem are labeled `heuristic`.

## Token game

- A state is a marking: the number of tokens on each sequence flow, plus one virtual entry place per start node.
- Activities, events, exclusive and event-based gateways consume **one** token from **one** incoming flow (uncontrolled merge).
- Activities and events without a gateway produce a token on every unconditional outgoing flow (implicit parallel split) and on any subset of conditional outgoing flows (implicit inclusive split; the default flow if none is chosen).
- **Exclusive** and **event-based** gateways produce exactly one token on one outgoing flow. The choice is non-deterministic: all alternatives are explored, because data conditions are not evaluated.
- **Parallel** gateways wait for a token on every incoming flow and produce a token on every outgoing flow.
- **Inclusive** gateways split into any non-empty subset of outgoing flows. As joins they fire once no further token can arrive on an empty incoming flow (the usual non-local OR-join semantics, decided on the explored state).
- **Sub-processes** are atomic activities for their parent scope and are analyzed as scopes of their own.
- **Boundary events** are alternative completions of their host: interrupting ones replace the normal outgoing flows, non-interrupting ones add a token while the host continues.
- **Terminate end events** remove all tokens of the scope.

## Findings

| Finding | Definition |
|---|---|
| Deadlock | A reachable state with tokens left in which nothing can fire and the scope has not completed. The witness trace and the blocked join are reported. |
| Lack of synchronization | A reachable state with more than one token on the same flow (unintended duplication, typically AND split closed by XOR join). |
| Livelock | A set of reachable states from which no final state can be reached (e.g. a loop without exit). |
| Dead element | A node that fires in no reachable state. |
| Sound | Option to complete, proper completion and no dead elements. |

## Limits

- Exploration stops at a configurable number of states and at a token bound per flow. If the limit is hit, the validator reports **"analysis incomplete"** and makes no soundness claim.
- Complex gateways are approximated as inclusive gateways; the result is flagged as approximate.
- Event sub-processes, compensation handlers and message-flow coordination between pools are not part of the analysis. Each pool is analyzed on its own.
- Data conditions are not evaluated: a decision whose outcomes are impossible in practice is still explored.

## Uses

- Validator (control-flow layer).
- Challenge assessment: behavioral queries (`always`, `optional`, `exclusive`, `precedes`, `concurrent`) on the explicit state graph.
- `runTokenGame`: a deterministic run with given gateway choices and triggered boundary events — the reference for "predict the execution" exercises and challenges.

Tests: `tests/unit/behavior.test.ts` (sequence, XOR/AND mismatch, livelock, OR-join, terminate, boundary events, dead elements, token game).
