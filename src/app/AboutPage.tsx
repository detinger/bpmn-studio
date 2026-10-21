/** About: what BPMN Studio supports, its documented limitations, data storage and licenses. */
const SUPPORT: Array<{ area: string; supported: string; limits: string }> = [
  {
    area: 'Modeling and interchange',
    supported:
      'All BPMN 2.0 elements of the bpmn-js modeler: events (incl. timer, message, error, escalation, signal, conditional, compensation, terminate), all task types, sub-processes, call activities, loop and multi-instance markers, all gateways, pools, lanes, sequence and message flows, data objects and stores, groups, annotations. Import and export of standard BPMN 2.0 XML with diagram interchange.',
    limits: 'Simulation parameters are stored separately from the BPMN XML, so exported files stay standard. Vendor-specific execution attributes (e.g. Camunda) are preserved but not interpreted.'
  },
  {
    area: 'Validation',
    supported:
      'bpmnlint rules plus BPMN Studio rules: connectivity, reachability, flow and message-flow correctness, gateway conditions and defaults, naming. Behavioral findings (deadlock, lack of synchronization, livelock, dead paths) come from exhaustive state-space exploration of the control flow.',
    limits:
      'Behavioral analysis covers sequence flows, gateways (XOR, AND, OR, event-based), events, boundary events and sub-processes. Data conditions are not evaluated: every outgoing flow of a decision is considered possible. Analyses that exceed the state-space limit are reported as inconclusive, never as correct.'
  },
  {
    area: 'Token animation',
    supported:
      'bpmn-js-token-simulation with play, pause, reset, step mode, speed, active-token inspection, gateway decisions, join waiting, execution trace and deadlock detection.',
    limits:
      'The animation illustrates control-flow semantics; it is not a process engine. Complex gateways cannot be animated and are listed as unsupported. Data, conditions and scripts are not evaluated — the student decides at gateways — and there is no time, cost or resource model.'
  },
  {
    area: 'Performance simulation',
    supported:
      'Discrete-event simulation with seeded random numbers, arrival processes (fixed, Poisson, distributions, batches), duration distributions (constant, uniform, triangular, truncated normal, lognormal, exponential, empirical), probabilistic routing, resource pools with capacities, calendars, costs, FIFO or priority queues and capacity limits, rework, boundary timers, independent replications, warm-up and 95% confidence intervals. Event logs export to CSV and XES.',
    limits:
      'One pool is simulated per run; other participants are the environment. Complex gateways cannot be simulated. Event sub-processes and compensation are not simulated; conditional flows, ad-hoc sub-processes, transactions and non-timer boundary events are approximated. Every approximation is listed before the results.'
  },
  {
    area: 'Assessment',
    supported:
      'Challenges are assessed through structure, required behavior (traces, ordering, concurrency, exclusivity over the reachable state space), BPMN semantics, scenario coverage, simulated performance and reasoning — never by comparing pictures.',
    limits: 'Activities are recognized by keywords in their names; use meaningful verb–object names. An optional AI tutor and text-to-BPMN generation are not included.'
  }
];

const LICENSES: Array<{ name: string; license: string; url: string; note?: string }> = [
  { name: 'bpmn-js', license: 'bpmn.io license', url: 'https://github.com/bpmn-io/bpmn-js', note: 'The bpmn.io watermark on every diagram must remain visible and links back to bpmn.io.' },
  { name: 'diagram-js, bpmn-moddle', license: 'MIT', url: 'https://github.com/bpmn-io' },
  { name: 'bpmn-js-token-simulation', license: 'MIT', url: 'https://github.com/bpmn-io/bpmn-js-token-simulation' },
  { name: 'bpmn-js-properties-panel', license: 'MIT', url: 'https://github.com/bpmn-io/bpmn-js-properties-panel' },
  { name: 'bpmnlint', license: 'MIT', url: 'https://github.com/bpmn-io/bpmnlint' },
  { name: 'React, React Router', license: 'MIT', url: 'https://react.dev' },
  { name: 'Recharts', license: 'MIT', url: 'https://recharts.org' },
  { name: 'idb', license: 'ISC', url: 'https://github.com/jakearchibald/idb' },
  { name: 'Lucide icons', license: 'ISC', url: 'https://lucide.dev' }
];

export default function AboutPage() {
  return (
    <div className="page">
      <div className="page-narrow">
        <div className="page-header">
          <div>
            <div className="eyebrow">About</div>
            <h1>BPMN Studio</h1>
            <p>
              Interactive BPMN Modeling, Simulation and Optimization Environment for undergraduate and graduate courses in Business Process Management. It runs entirely in
              your browser.
            </p>
          </div>
        </div>

        <section className="card" style={{ marginBottom: 16 }}>
          <h2>What is supported — and what is not</h2>
          <p className="muted">BPMN Studio never claims full BPMN execution support. These are the supported subsets and their documented limitations.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: '16%' }}>
                    Area
                  </th>
                  <th scope="col">Supported</th>
                  <th scope="col">Limitations</th>
                </tr>
              </thead>
              <tbody>
                {SUPPORT.map((s) => (
                  <tr key={s.area}>
                    <th scope="row">{s.area}</th>
                    <td>{s.supported}</td>
                    <td>{s.limits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card" style={{ marginBottom: 16 }}>
          <h2>Your data</h2>
          <p>
            Diagrams, simulation configurations, run summaries and learning progress are stored locally in your browser (IndexedDB). Nothing is sent to a server. Use{' '}
            <strong>Library → Export backup</strong> to save everything to a file, and <strong>Restore backup</strong> to move it to another browser. Clearing the browser data deletes
            your work.
          </p>
        </section>

        <section className="card">
          <h2>Open-source components and attribution</h2>
          <p>
            Diagrams are rendered and edited with{' '}
            <a href="https://bpmn.io" target="_blank" rel="noreferrer">
              bpmn.io
            </a>{' '}
            by Camunda. BPMN 2.0 is a standard of the{' '}
            <a href="https://www.omg.org/spec/BPMN/2.0.2/" target="_blank" rel="noreferrer">
              Object Management Group
            </a>
            .
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Component</th>
                  <th scope="col">License</th>
                  <th scope="col">Note</th>
                </tr>
              </thead>
              <tbody>
                {LICENSES.map((l) => (
                  <tr key={l.name}>
                    <td>
                      <a href={l.url} target="_blank" rel="noreferrer">
                        {l.name}
                      </a>
                    </td>
                    <td>{l.license}</td>
                    <td className="muted">{l.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
