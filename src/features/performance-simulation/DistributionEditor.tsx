import { useId, useState } from 'react';
import {
  DISTRIBUTION_LABELS,
  defaultDistribution,
  meanOf,
  validateDistribution,
  type Distribution,
  type DistributionType
} from '../../domain/simulation/distributions';
import { formatDuration, UNIT_FACTORS, type DisplayUnit } from '../../utils/duration';

const TYPES = Object.keys(DISTRIBUTION_LABELS) as DistributionType[];

function NumberInput({ label, value, onChange, factor }: { label: string; value: number; onChange: (v: number) => void; factor: number }) {
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(roundSmart(value / factor));
  return (
    <div className="field" style={{ marginBottom: 6 }}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="input input-sm"
        type="number"
        min={0}
        step="any"
        value={shown}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number.parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(n * factor);
        }}
        onBlur={() => setText(null)}
      />
    </div>
  );
}

function roundSmart(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function DistributionEditor({
  value,
  onChange,
  label = 'Duration',
  allowUnit = true,
  defaultUnit = 'minutes'
}: {
  value: Distribution;
  onChange: (d: Distribution) => void;
  label?: string;
  allowUnit?: boolean;
  defaultUnit?: DisplayUnit;
}) {
  const [unit, setUnit] = useState<DisplayUnit>(() => (meanOf(value) >= 240 && defaultUnit === 'minutes' ? 'hours' : defaultUnit));
  const f = UNIT_FACTORS[unit];
  const errs = validateDistribution(value);
  const typeId = useId();
  const set = (patch: Partial<Distribution>) => onChange({ ...value, ...patch } as Distribution);

  return (
    <div className="dist-editor">
      <div className="row" style={{ alignItems: 'flex-end', gap: 6 }}>
        <div className="field" style={{ flex: 1, marginBottom: 6 }}>
          <label htmlFor={typeId}>{label}</label>
          <select
            id={typeId}
            className="select select-sm"
            value={value.type}
            onChange={(e) => onChange(defaultDistribution(e.target.value as DistributionType, Math.max(meanOf(value), 0.1)))}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {DISTRIBUTION_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        {allowUnit && (
          <div className="field" style={{ marginBottom: 6 }}>
            <label className="visually-hidden" htmlFor={`${typeId}-u`}>
              Unit
            </label>
            <select id={`${typeId}-u`} className="select select-sm" value={unit} onChange={(e) => setUnit(e.target.value as DisplayUnit)}>
              <option value="seconds">sec</option>
              <option value="minutes">min</option>
              <option value="hours">hours</option>
              <option value="days">days</option>
            </select>
          </div>
        )}
      </div>
      <div className="field-row">
        {value.type === 'constant' && <NumberInput label="Value" value={value.value} factor={f} onChange={(v) => set({ value: v })} />}
        {value.type === 'uniform' && (
          <>
            <NumberInput label="Min" value={value.min} factor={f} onChange={(v) => set({ min: v })} />
            <NumberInput label="Max" value={value.max} factor={f} onChange={(v) => set({ max: v })} />
          </>
        )}
        {value.type === 'triangular' && (
          <>
            <NumberInput label="Min" value={value.min} factor={f} onChange={(v) => set({ min: v })} />
            <NumberInput label="Mode" value={value.mode} factor={f} onChange={(v) => set({ mode: v })} />
            <NumberInput label="Max" value={value.max} factor={f} onChange={(v) => set({ max: v })} />
          </>
        )}
        {(value.type === 'normal' || value.type === 'lognormal') && (
          <>
            <NumberInput label="Mean" value={value.mean} factor={f} onChange={(v) => set({ mean: v })} />
            <NumberInput label="Std. dev." value={value.sd} factor={f} onChange={(v) => set({ sd: v })} />
          </>
        )}
        {value.type === 'exponential' && <NumberInput label="Mean" value={value.mean} factor={f} onChange={(v) => set({ mean: v })} />}
      </div>
      {value.type === 'normal' && (
        <div className="field" style={{ marginBottom: 6 }}>
          <label>Negative samples</label>
          <select className="select select-sm" value={value.policy ?? 'resample'} onChange={(e) => set({ policy: e.target.value as 'resample' | 'truncate' })}>
            <option value="resample">Resample (rejection)</option>
            <option value="truncate">Truncate to 0</option>
          </select>
        </div>
      )}
      {value.type === 'empirical' && (
        <EmpiricalEditor value={value} factor={f} onChange={onChange} />
      )}
      <div className="subtle">
        {errs.length ? <span style={{ color: 'var(--error)' }}>{errs.join(' ')}</span> : <>Mean ≈ {formatDuration(meanOf(value))}</>}
      </div>
    </div>
  );
}

function EmpiricalEditor({ value, factor, onChange }: { value: Extract<Distribution, { type: 'empirical' }>; factor: number; onChange: (d: Distribution) => void }) {
  const [text, setText] = useState(() => value.values.map((v, i) => `${roundSmart(v / factor)}${value.weights ? `:${value.weights[i]}` : ''}`).join(', '));
  const id = useId();
  return (
    <div className="field" style={{ marginBottom: 6 }}>
      <label htmlFor={id}>Observed values (value or value:weight, comma separated)</label>
      <textarea
        id={id}
        className="input input-sm"
        rows={2}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parts = e.target.value.split(/[,;\s]+/).filter(Boolean);
          const values: number[] = [];
          const weights: number[] = [];
          let weighted = false;
          for (const p of parts) {
            const [v, w] = p.split(':');
            const n = Number.parseFloat(v);
            if (!Number.isFinite(n)) continue;
            values.push(n * factor);
            const wn = w !== undefined ? Number.parseFloat(w) : 1;
            if (w !== undefined) weighted = true;
            weights.push(Number.isFinite(wn) ? wn : 1);
          }
          if (values.length) onChange({ type: 'empirical', values, ...(weighted ? { weights } : {}) });
        }}
      />
    </div>
  );
}
