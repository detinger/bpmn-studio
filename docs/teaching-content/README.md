# Teaching content

All content lives in `src/data/` as typed TypeScript and is checked by tests (`tests/unit/content.test.ts`, `examples.test.ts`, `assessment.test.ts`, `contracts.test.ts`). Diagrams are written with the builder DSL (`src/domain/bpmn/builder.ts`), which produces BPMN 2.0 XML with diagram interchange and stable element ids.

## Learning path (`data/lessons/`)

Every concept has six parts: **explanation**, **visual example** (validated: no errors), **interactive demo** (token animation), **typical mistake**, **exercise** and **knowledge check**. A concept counts as completed when the exercise is solved and at least two thirds of the knowledge check is answered correctly. Retries are always allowed; every answer is explained.

| Level | Concepts (exercise type) |
|---|---|
| 1 Fundamentals | Processes and activities (choice) · Events (click the element) · Sequence flows (choice) · Basic process structure (click) |
| 2 Decisions | Exclusive gateways (predict) · Conditional routing (choice) · Default flows (choice) · Parallel gateways (predict) |
| 3 Advanced control flow | Inclusive gateways (predict) · Event-based gateways (choice) · Synchronization (click) · Loops (predict) · Deadlocks (click) |
| 4 Collaboration | Pools and lanes (choice) · Message flows (choice) · Interorganizational processes (click) |
| 5 Advanced BPMN | Sub-processes · Boundary events (predict) · Error handling (predict) · Timer events · Escalations · Compensation concepts (choice) |

Exercise types:

- **choice** — single or multiple choice, optionally with a diagram.
- **click** — click the element in a diagram that satisfies a description.
- **predict** — select the activities executed in a given situation. The correct answer is not stored; it is computed by the token game (`runTokenGame`) from the diagram, the gateway choices and the triggered boundary events, so the answer is always consistent with the model.

## Guided tutorials (`data/tutorials.ts`)

Tutorials run in the real modeler. Each step has an instruction, a hint and an automatic check on the student's live model, the validation report and observations from the token animation, so students can complete them without an instructor.

| Tutorial | Steps |
|---|---|
| Your first process | start event · task · second task · end event · connect everything · validate · run the token simulation |
| Decisions with an exclusive gateway | gateway · two labeled outcomes · complete both paths · sound and valid · simulate both outcomes |
| Parallel work and synchronization | parallel split · concurrent activities · synchronize · sound and valid · watch the join wait |

## Encyclopedia (`data/encyclopedia/`)

38 entries covering every element of the plan (events, activities, gateways, collaboration and artifacts). Each entry has the seven educational facets — name, graphical meaning, execution semantics, typical use cases, common mistakes, related concepts and at least one interactive mini example. The modeler's **Explain** tab shows the entry of the selected element.

## Example library (`data/examples/`)

Ten simulation-ready examples: order fulfillment, loan application, insurance claim (collaboration), hospital admission (inclusive gateway), support ticket with escalation, purchase approval (rework loop), travel booking (event-based gateway), payment with error handling, and the claims-handling AS-IS / TO-BE pair. Every example is sound, validates without errors and simulates with its preset (tested).

## Challenges (`data/challenges/`)

| Type | Challenges | Assessment |
|---|---|---|
| Build a process | Order handling with a decision (L2) · Onboarding with parallel preparation (L2) · Purchasing with a supplier (L4) · Assessment with a deadline (L5) | roles, gateways, end events, soundness, validation, behavioral queries |
| Fix a broken model | The stuck shipment · Shipped twice · The endless review (L3) · The customer is not your employee (L4) | as above, starting from a broken model |
| Predict execution | Which activities run? (L2) · One or both tests? (L3) · Reminders and deadlines (L5) | per scenario against the token game |
| Find a deadlock | The hidden deadlock · Waiting for the X-ray (L3) | location (blocked join or its mismatched split, found by analysis) and explanation |
| Improve a process | Faster claims with the same team (L2) | structure and behavior plus simulated targets under a fixed workload and a worker budget |
| Compare alternatives | Specialists or one team? (L3) | choice based on simulation results and choice of the explaining mechanism |

Each criterion belongs to one of six dimensions — structural correctness, required behavior, BPMN semantic correctness, scenario coverage, process performance, reasoning quality — and reports what is correct, what needs improvement, why it matters, and the elements concerned. Unsolved attempts suggest the next concept to study. Hints are revealed one at a time and the number used is recorded.

`tests/unit/assessment.test.ts` solves every model challenge with reference solutions — including behaviorally equivalent variants — and checks that the starting models and typical wrong solutions fail.

## Authoring

### A diagram

```ts
const spec: DiagramSpec = {
  nodes: [
    { id: 'Start', type: 'startEvent', name: 'Order received', at: [0, 0] },
    { id: 'Check', type: 'userTask', name: 'Check order', at: [1, 0] },
    { id: 'Ok', type: 'exclusiveGateway', name: 'Order valid?', at: [2, 0] },
    { id: 'Ship', type: 'task', name: 'Ship order', at: [3, -0.8] },
    { id: 'Reject', type: 'task', name: 'Reject order', at: [3, 0.8] },
    { id: 'Shipped', type: 'endEvent', name: 'Order shipped', at: [4, -0.8] },
    { id: 'Rejected', type: 'endEvent', name: 'Order rejected', at: [4, 0.8] }
  ],
  flows: [
    { from: 'Start', to: 'Check' },
    { from: 'Check', to: 'Ok' },
    { id: 'Flow_Yes', from: 'Ok', to: 'Ship', name: 'yes' },
    { id: 'Flow_No', from: 'Ok', to: 'Reject', name: 'no' },
    { from: 'Ship', to: 'Shipped' },
    { from: 'Reject', to: 'Rejected' }
  ]
};
```

`at` is a grid position (columns, rows). Pools, lanes, message flows, boundary events (`attachedTo`), sub-processes, data objects, annotations and groups are supported; see the type definitions in `builder.ts` and the existing content for examples.

### A model challenge

1. Write the scenario in business language; bold the activities the model must contain.
2. Define **roles** with keywords that a reasonable activity name will contain (`['check', 'stock', 'availab']`). Avoid keywords that also match other activities.
3. Choose **criteria** that express required behavior, not drawing: `always`, `optional`, `exclusive`, `precedes`, `concurrent`, `boundary`, `sound`, `noErrors`, plus structural minimums (`gateway`, `endEvents`, `pools`, `messageFlows`).
4. Add two or three hints, from gentle to specific, and the concepts to study.
5. Add a test with a reference solution, an equivalent variant and a wrong solution.

### A lesson concept

Add it to the level array in `data/lessons/`. The tests check that the explanation is substantial, all diagrams parse without warnings, the example validates without errors, quiz answers are in range, predict exercises have a deterministic answer and click exercises reference existing elements.
