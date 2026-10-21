# Performance simulation (discrete-event)

`src/domain/simulation/engine.ts` simulates many cases of one process under stochastic workload and limited resources. It is independent of the token animation. This page documents its semantics, statistical method and limitations. All times are in **minutes**.

## Inputs (`SimulationConfig`)

Stored per diagram, separately from the BPMN XML, keyed by BPMN element id. Contract: `src/domain/contracts/schemas/simulation-config.schema.json`.

| Input | Options |
|---|---|
| Case arrival | fixed interval; Poisson (exponential inter-arrival times); any duration distribution; optional batch size distribution; selectable start event |
| Durations | constant, uniform, triangular, normal (negative samples re-drawn or truncated at 0), lognormal (parameterized by mean and sd of the duration), exponential, empirical (values with optional weights) |
| Routing | probabilities per outgoing flow of exclusive, inclusive and event-based gateways |
| Resources | pools with a number of interchangeable workers, cost per working hour, optional weekly calendar (shifts), FIFO or priority queue discipline |
| Activities | duration, pool (or none = unlimited capacity), fixed cost per execution, queue capacity, loop repeat probability and maximum iterations, number of multi-instance instances |
| Events | waiting time of catch events and timer boundary events; occurrence probability of non-timer boundary events |
| Experiment | number of cases, replications, seed, warm-up (cases or time), SLA cycle-time target, waiting cost per hour, case priorities, maximum simulation time |

## Execution semantics

- **Clock.** Next-event time advance with a binary-heap event list. Ties are ordered by priority (shift changes before work, boundary timers before completions) and then by insertion order, so runs are deterministic.
- **Arrivals.** Cases are created at the selected start event until the configured number of cases is reached.
- **Sequence flows** take no time. A token on a flow immediately arrives at the target.
- **Activities.** On arrival a work item is created. Without a pool it starts immediately. With a pool it seizes a free worker if one is available and the queue is empty; otherwise it waits in the pool's queue. A worker is released when the work completes, and the queue is served FIFO or by case priority (FIFO among equal priorities). If the queue of an activity is full, the case is **rejected** and counted separately.
- **Calendars.** A pool accepts new work only while its calendar is open. Work that is in progress when a shift ends is finished (recorded as overtime and excluded from utilization).
- **Exclusive gateways** choose one outgoing flow by the configured probabilities (uniform if none are configured).
- **Inclusive gateways** take each non-default flow independently with its probability; if none is taken, the default flow (or the most likely flow) is used. **Inclusive joins** wait until no further token can arrive on an empty incoming flow.
- **Parallel gateways** split to all outgoing flows; joins wait for one token per incoming flow.
- **Event-based gateways** choose by configured probabilities, or — if none are configured — let the event that occurs first win (race of the configured waiting times).
- **Implicit splits.** Unconditional outgoing flows of activities and events are all taken. Conditional flows are taken independently with probability 0.5 (conditions are not evaluated; reported as an approximation).
- **Catch events** wait for their configured delay, or for the timer's ISO-8601 duration.
- **Timer boundary events** are scheduled when the host starts. Interrupting ones cancel the host (work done so far is charged as cancelled work) and continue on the boundary path; non-interrupting ones add a token while the host continues.
- **Other boundary events** (message, error, escalation, signal, conditional) occur with their configured probability per execution, at the moment the host would complete (approximation). Error and escalation end/throw events inside a sub-process trigger a matching boundary event on the sub-process.
- **Sub-processes** run their content as a nested scope; the sub-process completes when its content completes.
- **Loops.** Standard loop activities repeat with the repeat probability up to the maximum iterations. Re-executions of any activity in a case count as **rework**.
- **Multi-instance** activities create the configured number of work items, in sequence or in parallel; parallel instances can use several workers.
- **Terminate end events** cancel all remaining work of the scope.
- **Case completion.** A case is complete when its root scope has no tokens left. Cases still running when the simulation stops are reported as **incomplete** — for example in a deadlocking model — and are excluded from cycle-time statistics, with a warning instead of misleading KPIs.

## Measures

| KPI | Definition |
|---|---|
| Cycle time | completion − arrival of completed, measured cases |
| Processing time | sum of work durations of the case |
| Waiting time | sum of queue waiting times of the case (separate from processing) |
| Throughput | completed measured cases per hour of the measurement window |
| Work in progress | time-weighted average number of cases in the system |
| Resource utilization | busy time within scheduled time ÷ available worker time |
| Queue length | time-weighted average queue length per pool and activity |
| SLA compliance | share of completed cases with cycle time ≤ target |
| Cost per case | labor (worked minutes × pool cost per hour) + fixed activity costs + waiting cost |
| Rework rate | share of cases with at least one repeated activity |
| Activity frequencies, path variants | executions per activity; distinct sequences of completed activities |

## Randomness and reproducibility

- Generator: xoshiro128** seeded via SplitMix32.
- Independent streams per purpose are derived from (seed, replication, key): arrivals, batch sizes, priorities and, **per case**, each activity's durations, each gateway's decisions and each boundary event. This yields **common random numbers** across alternative models that share element ids.
- The same configuration and seed reproduce the same results exactly. Replication *r* uses its own derived seed.

## Experiments and statistics

- `runExperiment` runs *n* independent replications. Each KPI is estimated by the mean of the replication means, with the sample standard deviation and the half width of a two-sided 95% Student-t confidence interval (*n* − 1 degrees of freedom). With one replication no interval is reported and a warning is shown.
- **Warm-up**: the first *k* cases or the first *t* minutes are simulated but excluded from statistics.
- **Stopping**: the run ends when all cases are complete, or at the maximum simulation time / event limit (reported as truncated).
- **AS-IS vs TO-BE** (`compare.ts`): with equal seeds and replication counts the per-replication differences are paired (common random numbers) and a paired-t interval of the mean difference is used; otherwise Welch's approximation. Differences in experimental conditions (workload, cases, seed, warm-up) are disclosed.

## Executability check

Before a run, `support.ts` classifies every element outside the supported subset:

| Level | Meaning | Examples |
|---|---|---|
| **blocking** | the run is refused | complex gateways, invalid distributions, unknown pools, zero routing probabilities, calendars without shifts |
| **approximation** | simulated with a documented simplification | only one pool simulated (other participants are the environment; message flows are not simulated), conditional flows, ad-hoc sub-processes, transactions, non-timer boundary events, typed start events, events with several definitions; event sub-processes and compensation are not simulated |
| **assumption** | a default is used because a parameter is missing | activity without duration, gateway without probabilities, timer without duration, probabilities normalized |

The findings are shown before the results and stored with every run.

## Verification

`tests/unit/simulation.test.ts` checks the engine against known results: deterministic single server, overloaded FIFO server, **M/M/1** waiting time (Wq = ρ/(μ−λ)), **M/M/2** waiting time (Erlang C), reproducibility, resource effects, parallel branches, routing probabilities, inclusive joins, interrupting timers, deadlock reporting, calendars, warm-up, priority queues, queue capacity, multi-instance, sub-processes, refusal of unsupported constructs, confidence intervals and event-log export. `tests/unit/compare.test.ts` checks that identical alternatives show exactly zero difference under common random numbers.
