# Acceptance evidence

How each acceptance criterion of the roadmap (PLAN.md §5) is met, and where it is verified. *Unit* and *integration* refer to Vitest suites in `tests/unit` and `tests/integration`, *e2e* to Playwright suites in `tests/e2e`.

## Phase 1 — Modeling foundation

| Criterion | Evidence |
|---|---|
| Students can build valid basic BPMN diagrams | bpmn-js modeler with palette, context pad, properties panel; tutorial "Your first process" checks a student-built model step by step (e2e `learning.spec.ts`, `modeler.spec.ts`) |
| Models can be saved and reopened | Autosave to IndexedDB; e2e "edits with undo/redo and autosaves across reloads"; integration `storage.test.ts` |
| Import/export preserves supported elements | e2e "exports standard BPMN 2.0 XML with stable element ids"; integration "imports BPMN 2.0 XML…", "keeps element ids stable…"; unit `examples.test.ts` (all examples parse without warnings) |
| Usable without a backend | Static build, IndexedDB only; backup/restore (integration "restores a backup into an empty browser profile") |

Also: undo/redo, zoom/fit, keyboard shortcuts dialog, example library, light/dark theme (e2e "switches between light and dark mode"), testing infrastructure (Vitest, Playwright).

## Phase 2 — Educational features

| Criterion | Evidence |
|---|---|
| Students can learn core BPMN notation within the app | 22 concepts in 5 levels, 38-entry encyclopedia with demos, contextual Explain tab (unit `content.test.ts`; e2e `learning.spec.ts`) |
| Validation provides actionable feedback | Each issue has severity, element, explanation, consequence, suggestion and lesson link; layers and evidence labels (unit `validation.test.ts`; e2e "validates the model and explains issues") |
| Guided tutorials can be completed without an instructor | Automatic step checks on the live model, validator and animation (e2e "starts a guided tutorial in the modeler") |

## Phase 3 — Token simulation

| Criterion | Evidence |
|---|---|
| Supported models execute correctly | bpmn-js-token-simulation; reference semantics in `behavior.ts` (unit `behavior.test.ts`, token game) |
| Students observe routing and concurrency | Inspection panel: active/waiting tokens, decisions, history, trace, explain-a-token; step mode (e2e "runs the token simulation", "an encyclopedia entry runs its interactive demo") |
| Unsupported constructs are reported explicitly | Unsupported elements listed in the panel; validator executability layer (unit "reports executability separately for both engines"); [token-animation.md](simulation-semantics/token-animation.md) |

## Phase 4 — Performance simulation

| Criterion | Evidence |
|---|---|
| Simulations are reproducible | Seeded xoshiro128** streams (unit "is reproducible for equal seeds and differs for different seeds") |
| Resource constraints affect cycle time | unit "resource constraints affect cycle time", M/M/1 and M/M/2 checks |
| Queue metrics are calculated correctly | unit "M/M/1 waiting time matches queueing theory", "M/M/2 … Erlang-C", "deterministic overloaded server", priority queues, queue capacity |
| Event logs can be exported | CSV, XES and JSON (unit "exports event logs as CSV and XES"; unit `contracts.test.ts` event-log schema) |
| Unsupported semantics do not produce misleading results | Executability check with blocking/approximation/assumption levels (unit "refuses unsupported constructs explicitly", "reports incomplete cases for deadlocking models instead of misleading KPIs") |

Dashboard: KPI tiles, activity times, waiting-time distributions, utilization, bottleneck, WIP timeline, path frequencies (e2e "runs a simulation experiment and shows the dashboard"). Replications, warm-up and 95% CIs: unit "aggregates replications with confidence intervals", "warm-up cases are excluded from statistics". Semantics: [performance-simulation.md](simulation-semantics/performance-simulation.md).

## Phase 5 — Optimization

| Criterion | Evidence |
|---|---|
| Controlled redesign experiments | Duplicate as TO-BE with linked configuration; common random numbers (integration "duplicates a model as TO-BE and links the pair"; e2e "compares AS-IS and TO-BE under the same assumptions") |
| Equivalent assumptions or disclosed differences | unit "discloses different experimental conditions" |
| Improvement metrics calculated consistently | Paired-t / Welch intervals; unit "identical alternatives show zero difference under common random numbers", "detects a significant cycle-time improvement", "computes cost-benefit figures" |

## Phase 6 — Advanced learning

| Criterion | Evidence |
|---|---|
| Challenges provide explainable results | 15 challenges, six types, criteria in six dimensions with feedback, rationale and elements (unit `assessment.test.ts`; e2e `challenges.spec.ts`, compare challenge in `simulation.spec.ts`) |
| Students understand why an answer is correct or incorrect | Feedback per criterion, suggested next concept, progressive hints (e2e "a wrong location is explained, not just marked wrong", "a wrong answer is explained and can be retried") |
| AI-generated models are validated and never assumed correct | Not applicable: the optional AI tutor and text-to-BPMN generation are **not implemented**. Any future generator must run its output through the validator and behavioral analysis before showing it. |

Learning progress tracking and badges: e2e "completing the exercise and knowledge check completes a concept".

## Data contracts

Versioned interfaces and JSON Schemas for process model metadata, simulation configuration, simulation run, event log, assessment result and educational scenario; real data validated in unit `contracts.test.ts`.

## Accessibility

Skip link, landmarks, one `h1` per page, labeled controls and dialogs, keyboard-operable tabs and menus, visible focus, reduced reliance on color (icons and text with every status). e2e `app.spec.ts` checks headings, landmarks and that every visible control has an accessible name on all main pages. Not yet done: an automated WCAG audit (e.g. axe) and screen-reader testing of the canvas, which bpmn-js does not make accessible.

## Running the evidence

```bash
npm test            # unit + integration
npm run test:e2e    # end-to-end (Chromium)
npm run build       # type-check + production build
```
