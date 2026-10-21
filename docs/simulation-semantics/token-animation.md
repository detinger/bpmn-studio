# Token animation

The animated token simulation uses [bpmn-js-token-simulation](https://github.com/bpmn-io/bpmn-js-token-simulation). `src/features/token-simulation/controller.ts` drives it from the BPMN Studio UI and turns its trace into an inspectable state.

**It is a teaching device for execution semantics, not a process engine.** There is no time, no data, no resources and no statistics. Durations, costs and queues belong to the [performance simulation](performance-simulation.md).

## Controls

Play, pause, reset, step mode (activities wait until the student completes them), speed (0.5×–3×), and in the modeler: gateway decision selection, token highlighting, current activity inspection.

## Inspection

- Active tokens with their position and state (running, waiting at a join, waiting for an event)
- Completed and enabled activities
- Gateway decisions with the flow taken
- Execution history (numbered) and raw event trace
- **Explain a token**: why the token exists, which element produced it, why it followed its path and what is needed for it to continue
- **Blocked state**: when no token can move and the instance is not complete, the joins that wait and the flows they wait for are named

## Supported

Start, end (incl. terminate), intermediate and boundary events (timer, message, signal, error, escalation, conditional, compensation), all task types, sub-processes, transactions, call activities (as atomic activities), exclusive, parallel, inclusive and event-based gateways, pools, lanes and message flows between participants. Events and decisions that need an external trigger wait for the student (click on the event or the gateway).

## Not supported

Complex gateways cannot be animated; the simulation panel lists them as unsupported elements and the validator reports them in the executability layer. Data objects, conditions and scripts are never evaluated: the student decides at every gateway. Catch events (timers, messages, signals, conditions), receive tasks and event-based gateways wait until the student triggers them; a timer does not wait for its real duration.
