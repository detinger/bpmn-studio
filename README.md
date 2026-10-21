# BPMN Studio

**Interactive BPMN Modeling, Simulation and Optimization Environment** — a local-first web application for undergraduate and graduate courses in Business Process Management.

Students learn the BPMN 2.0 notation, build models, get explained validation feedback, watch tokens move through their models, measure performance with discrete-event simulation, compare AS-IS and TO-BE designs, and solve challenges that are assessed by behavior rather than by how a diagram looks.

```
Learn → Model → Validate → Simulate → Analyze → Optimize → (back to Model)
```

## Features

| Module | What students can do |
|---|---|
| **Modeler** | Edit BPMN 2.0 diagrams with bpmn-js (all elements of the BPMN poster), properties panel, undo/redo, zoom/fit, keyboard shortcuts, autosave, multiple diagrams, import/export of BPMN XML, SVG and PNG, light/dark mode. Selecting an element explains it (seven facets, with a runnable mini demo). |
| **Learning path** | 5 levels, 22 concepts. Each concept has an explanation, a visual example, an interactive token demo, a typical mistake, an exercise and a knowledge check. Three guided tutorials check each step against the student's live model. Badges mark milestones. |
| **Encyclopedia** | 38 BPMN elements: name, graphical meaning, execution semantics, use cases, common mistakes, related concepts and an interactive demo. |
| **Validator** | bpmnlint plus BPMN Studio rules in five layers (structure, semantics, control flow, executability, pedagogy). Deadlocks, lack of synchronization, livelocks and dead paths are proven by state-space exploration; heuristics are labeled as such. Every finding states severity, element, explanation, consequence, fix and a lesson link. |
| **Token animation** | bpmn-js-token-simulation with play/pause/reset, step mode, speed, active/waiting tokens, gateway decisions, execution history, event trace, "explain this token" and deadlock detection. Unsupported elements are listed. |
| **Performance lab** | Discrete-event simulation: arrival processes, duration distributions, routing probabilities, resource pools with calendars and costs, FIFO/priority queues with capacity, rework, boundary events, warm-up, independent replications and 95% confidence intervals. Dashboard with KPIs, bottlenecks, utilization, waiting-time distributions, timeline and path frequencies. Event logs export to CSV, XES and JSON. |
| **AS-IS vs TO-BE** | Duplicate a model as TO-BE, run both under common random numbers, compare KPIs with paired confidence intervals, bottleneck shifts, utilization differences and cost–benefit, with guiding questions. |
| **Challenges** | 15 challenges of six types (build, fix, predict, find a deadlock, improve, compare) with explained, multi-dimensional assessment and progressive hints. |

## Getting started

Requirements: Node.js 24.15 or newer.

```bash
npm install
npm run dev          # http://localhost:5173
```

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check and production build into `dist/` (static files, no backend) |
| `npm run preview` | Serve the production build |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright, Chromium; run `npx playwright install chromium` once) |
| `npm run typecheck` | TypeScript only |

All data (diagrams, simulation configurations, run summaries, learning progress) is stored in the browser's IndexedDB. **Library → Export backup / Restore backup** moves it between browsers.

## Deployment

`npm run build` produces a static site in `dist/` that any web server can host; no backend or environment variables are needed. The repository includes a `Dockerfile` and a `Caddyfile` for container hosting. Step-by-step instructions for Railway, including settings, custom domains, updates and troubleshooting, are in [DEPLOYMENT.md](DEPLOYMENT.md).

## Project structure

```text
src/
  app/            shell, routing, theme, toasts, progress tracking, home and about pages
  components/     shared UI primitives and the read-only BpmnViewer
  features/       UI modules: modeler, learning, validation, token-simulation,
                  performance-simulation, analytics, optimization, challenges, library
  domain/         framework-free logic
    bpmn/         diagram builder DSL, BPMN parsing, process graph, behavioral analysis
    validation/   validator and issue catalog
    simulation/   DES engine, distributions, random streams, experiments, statistics, comparison
    resources/    resource calendars
    assessment/   challenge assessment
    contracts/    versioned data contracts and JSON Schemas
  data/           examples, lessons, tutorials, encyclopedia, challenges, badges
  services/       application services (create/open/import diagrams, workspaces)
  storage/        IndexedDB persistence
tests/
  unit/           domain, content and contract tests
  integration/    persistence and services on IndexedDB
  e2e/            Playwright user journeys
docs/
  architecture/          architecture and decisions
  simulation-semantics/  behavioral analysis, token animation, performance simulation
  teaching-content/      learning content, challenges and authoring guide
  acceptance-evidence.md roadmap acceptance criteria and their evidence
```

## Supported BPMN and limitations

BPMN Studio never claims full BPMN execution support. In short:

- **Modeling and interchange** cover the complete BPMN 2.0 element set of bpmn-js. Simulation settings are stored separately, so exported XML stays standard.
- **Behavioral analysis** covers sequence flows, XOR/AND/OR/event-based gateways, events, boundary events and sub-processes. Data conditions are not evaluated (every decision outcome is considered possible).
- **Token animation** illustrates control-flow semantics; it is not a process engine.
- **Performance simulation** simulates one pool per run. Complex gateways are refused; event sub-processes and compensation are not simulated; conditional flows, ad-hoc sub-processes, transactions and non-timer boundary events are approximated. Every approximation is listed before the results.

Details: [docs/simulation-semantics](docs/simulation-semantics/). The About page in the app shows the same summary.

## Data contracts

Versioned TypeScript interfaces (`src/domain/contracts`) and JSON Schemas (`src/domain/contracts/schemas`) for process model metadata, simulation configuration, simulation run, event log, assessment result and educational scenario. They allow integration with process mining and digital twin tools; tests validate real application data against the schemas.

## Licenses and attribution

BPMN Studio uses [bpmn.io](https://bpmn.io) (bpmn-js, diagram-js, bpmn-moddle, bpmn-js-token-simulation, bpmn-js-properties-panel, bpmnlint). bpmn-js is distributed under the bpmn.io license: the bpmn.io watermark on rendered diagrams must remain visible and unobstructed (an end-to-end test checks this). The other dependencies use MIT or ISC licenses; see the About page.
