/**
 * Full editor of a simulation configuration: workload, experimental design,
 * targets and costs, resources and calendars, activities, routing and events.
 */
import { useState } from 'react';
import { CalendarClock, ChevronDown, ChevronRight, Dice5, Plus, Route, Target, Timer, Trash2, Users, Workflow } from 'lucide-react';
import type { ProcessGraph } from '../../domain/bpmn/graph';
import { displayName } from '../../domain/bpmn/graph';
import { configurableElements, defaultActivityConfig, type ResourcePoolConfig, type SimulationConfig } from '../../domain/simulation/config';
import { describeDistribution, type Distribution } from '../../domain/simulation/distributions';
import { WEEKDAYS, formatClock, parseClock, officeHours, type WeeklyCalendar } from '../../domain/resources/calendar';
import { DistributionEditor } from './DistributionEditor';
import { formatDuration, round } from '../../utils/duration';

interface Props {
  config: SimulationConfig;
  graph: ProcessGraph;
  onChange: (c: SimulationConfig) => void;
}

function Section({ title, icon, children, defaultOpen = true }: { title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="config-section">
      <h4>
        <button className="link-button row" style={{ gap: 6, fontWeight: 650 }} onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {icon} {title}
        </button>
      </h4>
      {open && children}
    </section>
  );
}

function NumField({ label, value, onChange, min = 0, step = 1, hint, suffix }: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number; hint?: string; suffix?: string }) {
  return (
    <div className="field">
      <label>
        {label}
        {suffix && <span className="subtle"> ({suffix})</span>}
      </label>
      <input className="input input-sm" type="number" min={min} step={step} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

const CALENDAR_PRESETS: Record<string, { label: string; cal: WeeklyCalendar | null }> = {
  always: { label: 'Always available (24/7)', cal: null },
  office: { label: 'Office hours Mon–Fri 08:00–16:00', cal: officeHours(8 * 60, 16 * 60) },
  long: { label: 'Mon–Fri 07:00–19:00', cal: officeHours(7 * 60, 19 * 60) },
  twoShift: { label: 'Two shifts Mon–Fri 06:00–22:00', cal: officeHours(6 * 60, 22 * 60) }
};

function presetOf(cal: WeeklyCalendar | null): string {
  for (const [k, p] of Object.entries(CALENDAR_PRESETS)) if (JSON.stringify(p.cal) === JSON.stringify(cal)) return k;
  return 'custom';
}

export function ConfigEditor({ config, graph, onChange }: Props) {
  const update = (fn: (c: SimulationConfig) => void) => {
    const next = structuredClone(config);
    fn(next);
    next.version = (config.version ?? 0) + 1;
    onChange(next);
  };
  const { activities, gateways, events } = configurableElements(graph);
  const starts = Object.values(graph.nodes).filter((n) => n.kind === 'start' && graph.rootScopeIds.includes(n.scopeId));
  const processes = graph.rootScopeIds.filter((id) => graph.scopes[id].nodeIds.length > 0);
  const [openActivity, setOpenActivity] = useState<string | null>(null);

  return (
    <div>
      <Section title="Workload" icon={<Users size={14} />}>
        {processes.length > 1 && (
          <div className="field">
            <label>Simulated process (pool)</label>
            <select className="select select-sm" value={config.processId ?? ''} onChange={(e) => update((c) => void (c.processId = e.target.value || undefined))}>
              <option value="">Automatic</option>
              {processes.map((p) => (
                <option key={p} value={p}>
                  {graph.participants.find((x) => x.processId === p)?.name || graph.scopes[p].name || p}
                </option>
              ))}
            </select>
          </div>
        )}
        {starts.length > 1 && (
          <div className="field">
            <label>Cases start at</label>
            <select className="select select-sm" value={config.arrival.startEventId ?? ''} onChange={(e) => update((c) => void (c.arrival.startEventId = e.target.value || undefined))}>
              <option value="">First start event</option>
              {starts.map((s) => (
                <option key={s.id} value={s.id}>
                  {displayName(graph, s.id)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label>Arrival process</label>
          <select
            className="select select-sm"
            value={config.arrival.kind}
            onChange={(e) =>
              update((c) => {
                c.arrival.kind = e.target.value as SimulationConfig['arrival']['kind'];
                if (c.arrival.kind === 'distribution' && !c.arrival.distribution) c.arrival.distribution = { type: 'uniform', min: c.arrival.interval * 0.5, max: c.arrival.interval * 1.5 };
              })
            }
          >
            <option value="poisson">Poisson arrivals (random, exponential inter-arrival times)</option>
            <option value="fixed">Fixed interval</option>
            <option value="distribution">Custom inter-arrival distribution</option>
          </select>
        </div>
        {config.arrival.kind !== 'distribution' ? (
          <div className="field-row">
            <NumField
              label={config.arrival.kind === 'fixed' ? 'Interval' : 'Mean inter-arrival time'}
              suffix="min"
              step={0.5}
              value={config.arrival.interval}
              onChange={(v) => update((c) => void (c.arrival.interval = Math.max(0.01, v)))}
              hint={`≈ ${round(60 / Math.max(0.01, config.arrival.interval), 2)} cases per hour`}
            />
          </div>
        ) : (
          <DistributionEditor label="Inter-arrival time" value={config.arrival.distribution!} onChange={(d) => update((c) => void (c.arrival.distribution = d))} />
        )}
        <label className="checkbox" style={{ marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={!!config.arrival.batchSize}
            onChange={(e) => update((c) => void (c.arrival.batchSize = e.target.checked ? { type: 'uniform', min: 1, max: 4 } : undefined))}
          />
          Batch arrivals (several cases arrive together)
        </label>
        {config.arrival.batchSize && <DistributionEditor label="Batch size (cases)" value={config.arrival.batchSize} allowUnit={false} onChange={(d) => update((c) => void (c.arrival.batchSize = d))} />}
        <NumField label="Number of cases per replication" value={config.numberOfCases} min={1} onChange={(v) => update((c) => void (c.numberOfCases = Math.max(1, Math.floor(v))))} />
      </Section>

      <Section title="Experimental design" icon={<Dice5 size={14} />}>
        <div className="field-row">
          <NumField label="Replications" value={config.replications} min={1} onChange={(v) => update((c) => void (c.replications = Math.min(100, Math.max(1, Math.floor(v)))))} hint="independent runs" />
          <div className="field">
            <label>Random seed</label>
            <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
              <input className="input input-sm" style={{ width: '100%' }} type="number" value={config.seed} onChange={(e) => update((c) => void (c.seed = Math.floor(Number(e.target.value)) || 0))} />
              <button className="btn btn-sm btn-icon" title="New random seed" aria-label="New random seed" onClick={() => update((c) => void (c.seed = Math.floor(Math.random() * 1e6)))}>
                <Dice5 size={14} />
              </button>
            </div>
            <span className="hint">same seed → identical results</span>
          </div>
        </div>
        <div className="field">
          <label>Warm-up period (excluded from statistics)</label>
          <select
            className="select select-sm"
            value={config.warmUp.kind}
            onChange={(e) =>
              update((c) => {
                const kind = e.target.value;
                c.warmUp = kind === 'none' ? { kind: 'none' } : kind === 'cases' ? { kind: 'cases', count: Math.min(20, Math.floor(c.numberOfCases / 5)) } : { kind: 'time', duration: 240 };
              })
            }
          >
            <option value="none">None</option>
            <option value="cases">First N cases</option>
            <option value="time">Initial time span</option>
          </select>
        </div>
        {config.warmUp.kind === 'cases' && <NumField label="Warm-up cases" value={config.warmUp.count} onChange={(v) => update((c) => void (c.warmUp = { kind: 'cases', count: Math.max(0, Math.floor(v)) }))} />}
        {config.warmUp.kind === 'time' && <NumField label="Warm-up duration" suffix="min" value={config.warmUp.duration} onChange={(v) => update((c) => void (c.warmUp = { kind: 'time', duration: Math.max(0, v) }))} />}
        <div className="field-row">
          <div className="field">
            <label>Simulation starts</label>
            <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
              <select
                className="select select-sm"
                value={Math.floor(config.calendarOffset / 1440)}
                onChange={(e) => update((c) => void (c.calendarOffset = Number(e.target.value) * 1440 + (c.calendarOffset % 1440)))}
                aria-label="Start weekday"
              >
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
              <input
                className="input input-sm"
                style={{ width: 80 }}
                defaultValue={formatClock(config.calendarOffset % 1440)}
                aria-label="Start time"
                onBlur={(e) => {
                  const m = parseClock(e.target.value);
                  if (m !== null) update((c) => void (c.calendarOffset = Math.floor(c.calendarOffset / 1440) * 1440 + m));
                }}
              />
            </div>
            <span className="hint">relevant for resource calendars</span>
          </div>
          <NumField label="Max. simulated time" suffix="days" value={Math.round((config.maxSimulationTime / 1440) * 10) / 10} onChange={(v) => update((c) => void (c.maxSimulationTime = Math.max(1, v) * 1440))} />
        </div>
      </Section>

      <Section title="Targets & costs" icon={<Target size={14} />}>
        <label className="checkbox" style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={!!config.sla} onChange={(e) => update((c) => void (c.sla = e.target.checked ? { cycleTimeTarget: 120 } : null))} />
          Service level agreement (SLA) on cycle time
        </label>
        {config.sla && <NumField label="Cases should complete within" suffix="min" value={config.sla.cycleTimeTarget} onChange={(v) => update((c) => void (c.sla = { cycleTimeTarget: Math.max(0, v) }))} hint={formatDuration(config.sla.cycleTimeTarget)} />}
        <NumField label="Waiting cost per case-hour" suffix="€" step={0.5} value={config.costs.waitingCostPerHour} onChange={(v) => update((c) => void (c.costs.waitingCostPerHour = Math.max(0, v)))} hint="e.g. customer dissatisfaction or capital tied up" />
        <div className="field">
          <label>Case priorities (for priority queues)</label>
          {config.priorities.map((p, i) => (
            <div key={i} className="row" style={{ marginBottom: 4 }}>
              <span className="subtle">priority</span>
              <input className="input input-sm" type="number" style={{ width: 64 }} value={p.value} onChange={(e) => update((c) => void (c.priorities[i].value = Number(e.target.value)))} aria-label="Priority value" />
              <span className="subtle">share</span>
              <input className="input input-sm" type="number" step={0.05} min={0} max={1} style={{ width: 72 }} value={p.probability} onChange={(e) => update((c) => void (c.priorities[i].probability = Math.max(0, Number(e.target.value))))} aria-label="Priority share" />
              <button className="btn btn-sm btn-ghost btn-icon" aria-label="Remove priority class" onClick={() => update((c) => void c.priorities.splice(i, 1))}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => update((c) => void c.priorities.push({ value: c.priorities.length ? 0 : 1, probability: c.priorities.length ? 0.8 : 0.2 }))}>
            <Plus size={13} /> Add priority class
          </button>
        </div>
      </Section>

      <Section title="Resources" icon={<CalendarClock size={14} />}>
        {config.resourcePools.map((p, i) => (
          <PoolEditor
            key={p.id}
            pool={p}
            usedBy={activities.filter((a) => config.activities[a.id]?.resourcePoolId === p.id).map((a) => displayName(graph, a.id))}
            onChange={(np) => update((c) => void (c.resourcePools[i] = np))}
            onRemove={() =>
              update((c) => {
                c.resourcePools.splice(i, 1);
                for (const a of Object.values(c.activities)) if (a.resourcePoolId === p.id) a.resourcePoolId = null;
              })
            }
          />
        ))}
        <button
          className="btn btn-sm"
          onClick={() =>
            update((c) => {
              let n = c.resourcePools.length + 1;
              while (c.resourcePools.some((x) => x.id === `pool-${n}`)) n++;
              c.resourcePools.push({ id: `pool-${n}`, name: `Pool ${n}`, capacity: 1, costPerHour: 40, calendar: null, discipline: 'FIFO' });
            })
          }
        >
          <Plus size={13} /> Add resource pool
        </button>
      </Section>

      <Section title={`Activities (${activities.length})`} icon={<Workflow size={14} />}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Activity</th>
                <th>Duration (min)</th>
                <th>Resource</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => {
                const cfg = config.activities[a.id] ?? defaultActivityConfig(a.type);
                const open = openActivity === a.id;
                const hasContent = a.kind === 'subProcess' && (graph.scopes[a.id]?.nodeIds.length ?? 0) > 0;
                return (
                  <ActivityRow
                    key={a.id}
                    name={displayName(graph, a.id)}
                    duration={hasContent ? null : cfg.duration}
                    pools={config.resourcePools}
                    poolId={cfg.resourcePoolId}
                    open={open}
                    onToggle={() => setOpenActivity(open ? null : a.id)}
                    onPool={(pid) => update((c) => void (c.activities[a.id] = { ...cfg, resourcePoolId: pid }))}
                    onDuration={(d) => update((c) => void (c.activities[a.id] = { ...cfg, duration: d }))}
                    fixedCost={cfg.fixedCost}
                    onFixedCost={(v) => update((c) => void (c.activities[a.id] = { ...cfg, fixedCost: Math.max(0, v) }))}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {gateways.length > 0 && (
        <Section title={`Routing (${gateways.length})`} icon={<Route size={14} />}>
          {gateways.map((g) => {
            const probs = config.gateways[g.id]?.probabilities ?? {};
            return (
              <div key={g.id} className="field">
                <label>
                  {displayName(graph, g.id)} <span className="subtle">({g.gateway === 'inclusive' ? 'each flow independently' : g.gateway === 'eventBased' ? 'event-based' : 'exclusive'})</span>
                </label>
                {g.outgoing.map((f) => (
                  <div key={f} className="row" style={{ marginBottom: 3, flexWrap: 'nowrap' }}>
                    <span style={{ flex: 1, fontSize: 13 }}>{graph.flows[f].name || `→ ${displayName(graph, graph.flows[f].targetId)}`}</span>
                    <input
                      className="input input-sm"
                      type="number"
                      step={0.05}
                      min={0}
                      max={1}
                      style={{ width: 76, textAlign: 'right' }}
                      value={probs[f] ?? 0}
                      aria-label={`Probability of ${graph.flows[f].name || graph.flows[f].targetId}`}
                      onChange={(e) => update((c) => void (c.gateways[g.id] = { probabilities: { ...probs, [f]: Math.min(1, Math.max(0, Number(e.target.value))) } }))}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </Section>
      )}

      {events.length > 0 && (
        <Section title={`Events (${events.length})`} icon={<Timer size={14} />} defaultOpen={false}>
          {events.map((e) => {
            const ev = config.events[e.id] ?? {};
            const nonTimerBoundary = e.kind === 'boundary' && e.eventDefinition !== 'timer';
            return (
              <div key={e.id} className="field" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                <label>
                  {displayName(graph, e.id)} <span className="subtle">({e.kind === 'boundary' ? `${e.interrupting === false ? 'non-interrupting ' : ''}boundary` : 'catch'} {e.eventDefinition})</span>
                </label>
                {nonTimerBoundary ? (
                  <div className="row">
                    <span className="subtle">probability per execution</span>
                    <input className="input input-sm" type="number" step={0.05} min={0} max={1} style={{ width: 76 }} value={ev.probability ?? 0} onChange={(x) => update((c) => void (c.events[e.id] = { ...ev, probability: Math.min(1, Math.max(0, Number(x.target.value))) }))} />
                  </div>
                ) : ev.delay ? (
                  <>
                    <DistributionEditor label="Waiting time" value={ev.delay} onChange={(d) => update((c) => void (c.events[e.id] = { ...ev, delay: d }))} />
                    <button className="btn btn-sm" onClick={() => update((c) => void (c.events[e.id] = { ...ev, delay: undefined }))}>
                      Remove
                    </button>
                  </>
                ) : (
                  <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => update((c) => void (c.events[e.id] = { ...ev, delay: { type: 'exponential', mean: 60 } }))}>
                    {e.eventDefinition === 'timer' ? 'Override timer duration' : 'Set waiting time'}
                  </button>
                )}
              </div>
            );
          })}
        </Section>
      )}
    </div>
  );
}

function ActivityRow({
  name,
  duration,
  pools,
  poolId,
  open,
  onToggle,
  onPool,
  onDuration,
  fixedCost,
  onFixedCost
}: {
  name: string;
  duration: Distribution | null;
  pools: ResourcePoolConfig[];
  poolId: string | null;
  open: boolean;
  onToggle: () => void;
  onPool: (id: string | null) => void;
  onDuration: (d: Distribution) => void;
  fixedCost: number;
  onFixedCost: (v: number) => void;
}) {
  return (
    <>
      <tr>
        <td>{name}</td>
        <td>
          {duration ? (
            <button className="link-button" onClick={onToggle} aria-expanded={open} style={{ color: 'var(--primary)' }}>
              {describeDistribution(duration)}
            </button>
          ) : (
            <span className="subtle">from content</span>
          )}
        </td>
        <td>
          {duration && (
            <select className="select select-sm" style={{ maxWidth: 130 }} value={poolId ?? ''} onChange={(e) => onPool(e.target.value || null)} aria-label={`Resource for ${name}`}>
              <option value="">none</option>
              {pools.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </td>
      </tr>
      {open && duration && (
        <tr>
          <td colSpan={3} style={{ background: 'var(--bg-subtle)' }}>
            <DistributionEditor value={duration} onChange={onDuration} label="Processing time" />
            <div className="field" style={{ maxWidth: 200 }}>
              <label>Fixed cost per execution (€)</label>
              <input className="input input-sm" type="number" min={0} step="any" value={fixedCost} onChange={(e) => onFixedCost(Number(e.target.value))} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function PoolEditor({ pool, usedBy, onChange, onRemove }: { pool: ResourcePoolConfig; usedBy: string[]; onChange: (p: ResourcePoolConfig) => void; onRemove: () => void }) {
  const preset = presetOf(pool.calendar);
  return (
    <div className="card" style={{ padding: 12, marginBottom: 10 }}>
      <div className="row" style={{ marginBottom: 6, flexWrap: 'nowrap' }}>
        <input className="input input-sm" style={{ flex: 1, fontWeight: 600 }} value={pool.name} onChange={(e) => onChange({ ...pool, name: e.target.value })} aria-label="Pool name" />
        <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={onRemove} aria-label={`Remove ${pool.name}`} title="Remove pool">
          <Trash2 size={14} />
        </button>
      </div>
      <div className="field-row">
        <NumField label="Workers" value={pool.capacity} min={1} onChange={(v) => onChange({ ...pool, capacity: Math.max(1, Math.floor(v)) })} />
        <NumField label="Cost per worker-hour" suffix="€" value={pool.costPerHour} onChange={(v) => onChange({ ...pool, costPerHour: Math.max(0, v) })} />
        <div className="field">
          <label>Queue</label>
          <select className="select select-sm" value={pool.discipline} onChange={(e) => onChange({ ...pool, discipline: e.target.value as 'FIFO' | 'PRIORITY' })}>
            <option value="FIFO">FIFO</option>
            <option value="PRIORITY">Priority</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Availability</label>
        <select
          className="select select-sm"
          value={preset}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'custom') onChange({ ...pool, calendar: pool.calendar ?? officeHours() });
            else onChange({ ...pool, calendar: structuredClone(CALENDAR_PRESETS[v].cal) });
          }}
        >
          {Object.entries(CALENDAR_PRESETS).map(([k, p]) => (
            <option key={k} value={k}>
              {p.label}
            </option>
          ))}
          <option value="custom">Custom shifts…</option>
        </select>
      </div>
      {preset === 'custom' && pool.calendar && <ShiftEditor cal={pool.calendar} onChange={(cal) => onChange({ ...pool, calendar: cal })} />}
      <div className="subtle">{usedBy.length ? `Performs: ${usedBy.join(', ')}` : 'Not assigned to any activity.'}</div>
    </div>
  );
}

function ShiftEditor({ cal, onChange }: { cal: WeeklyCalendar; onChange: (c: WeeklyCalendar) => void }) {
  return (
    <div className="stack" style={{ gap: 6, marginBottom: 8 }}>
      {cal.shifts.map((s, i) => (
        <div key={i} className="row" style={{ gap: 4 }}>
          {WEEKDAYS.map((d, di) => (
            <label key={d} className="checkbox" style={{ fontSize: 12 }}>
              <input
                type="checkbox"
                checked={s.days.includes(di)}
                onChange={(e) => {
                  const next = structuredClone(cal);
                  next.shifts[i].days = e.target.checked ? [...s.days, di].sort() : s.days.filter((x) => x !== di);
                  onChange(next);
                }}
              />
              {d}
            </label>
          ))}
          <input
            className="input input-sm"
            style={{ width: 62 }}
            defaultValue={formatClock(s.start)}
            aria-label="Shift start"
            onBlur={(e) => {
              const m = parseClock(e.target.value);
              if (m === null) return;
              const next = structuredClone(cal);
              next.shifts[i].start = m;
              onChange(next);
            }}
          />
          –
          <input
            className="input input-sm"
            style={{ width: 62 }}
            defaultValue={formatClock(s.end)}
            aria-label="Shift end"
            onBlur={(e) => {
              const m = parseClock(e.target.value);
              if (m === null) return;
              const next = structuredClone(cal);
              next.shifts[i].end = m;
              onChange(next);
            }}
          />
          <button
            className="btn btn-sm btn-ghost btn-icon"
            aria-label="Remove shift"
            onClick={() => {
              const next = structuredClone(cal);
              next.shifts.splice(i, 1);
              onChange(next);
            }}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <button className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange({ ...cal, shifts: [...cal.shifts, { days: [5], start: 9 * 60, end: 13 * 60 }] })}>
        <Plus size={13} /> Add shift
      </button>
    </div>
  );
}
