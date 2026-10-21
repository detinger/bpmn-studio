/**
 * Simulation charts (Recharts). Conventions: one value axis per chart, thin
 * bars (≤ 24px) with rounded data ends, 2px lines, hairline grid, legends for
 * two or more series, hover tooltips, and a table view next to every chart.
 */
import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
  type TooltipContentProps
} from 'recharts';
import { useChartTheme } from './chartTheme';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TipProps = TooltipContentProps<any, any>;
import { formatDuration, formatPercent, round } from '../../utils/duration';

export function ChartFrame({ title, subtitle, legend, children, height = 280 }: { title: string; subtitle?: string; legend?: ReactNode; children: ReactNode; height?: number }) {
  return (
    <figure className="card chart-card" style={{ margin: 0 }}>
      <figcaption style={{ marginBottom: 10 }}>
        <strong>{title}</strong>
        {subtitle && <div className="subtle">{subtitle}</div>}
        {legend && <div style={{ marginTop: 6 }}>{legend}</div>}
      </figcaption>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function Legend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="legend">
      {items.map((i) => (
        <span key={i.label}>
          <i style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function TooltipBox({ title, rows }: { title?: ReactNode; rows: Array<{ label: string; value: string; color?: string }> }) {
  return (
    <div className="chart-tooltip">
      {title && <div style={{ fontWeight: 650, marginBottom: 4 }}>{title}</div>}
      {rows.map((r) => (
        <div key={r.label} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          {r.color && <i style={{ width: 8, height: 8, borderRadius: 2, background: r.color, display: 'inline-block' }} />}
          <span className="muted">{r.label}</span>
          <span className="spacer" />
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{r.value}</strong>
        </div>
      ))}
    </div>
  );
}

const axisProps = (t: ReturnType<typeof useChartTheme>) => ({
  stroke: t.axis,
  tick: { fill: t.muted, fontSize: 11 },
  tickLine: false
});

// ---------------------------------------------------------------------------

export interface ActivityTimeDatum {
  name: string;
  processing: number;
  waiting: number;
}

/** Average processing vs. waiting time per activity (stacked horizontal bars). */
export function ActivityTimeChart({ data }: { data: ActivityTimeDatum[] }) {
  const t = useChartTheme();
  const height = Math.max(160, data.length * 34 + 50);
  return (
    <ChartFrame
      title="Where does the time go?"
      subtitle="Average time per execution, minutes"
      height={height}
      legend={<Legend items={[{ label: 'Processing', color: t.series[0] }, { label: 'Waiting for a resource', color: t.series[1] }]} />}
    >
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap={8}>
        <CartesianGrid horizontal={false} stroke={t.grid} />
        <XAxis type="number" {...axisProps(t)} tickFormatter={(v) => round(v, 0)} />
        <YAxis type="category" dataKey="name" width={150} {...axisProps(t)} tick={{ fill: t.textMuted, fontSize: 12 }} />
        <Tooltip
          cursor={{ fill: t.grid, opacity: 0.4 }}
          content={(p: TipProps) =>
            p.active && p.payload?.length ? (
              <TooltipBox
                title={p.label}
                rows={[
                  { label: 'Processing', value: formatDuration(Number(p.payload[0]?.payload.processing)), color: t.series[0] },
                  { label: 'Waiting', value: formatDuration(Number(p.payload[0]?.payload.waiting)), color: t.series[1] }
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="processing" stackId="a" fill={t.series[0]} maxBarSize={24} stroke={t.surface} strokeWidth={2} />
        <Bar dataKey="waiting" stackId="a" fill={t.series[1]} maxBarSize={24} radius={[0, 4, 4, 0]} stroke={t.surface} strokeWidth={2} />
      </BarChart>
    </ChartFrame>
  );
}

export interface UtilizationDatum {
  name: string;
  utilization: number;
  ci?: number;
}

export function UtilizationChart({ data }: { data: UtilizationDatum[] }) {
  const t = useChartTheme();
  const height = Math.max(150, data.length * 38 + 50);
  return (
    <ChartFrame title="Resource utilization" subtitle="Share of scheduled time spent working (dashed: 85% guideline)" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 8 }} barCategoryGap={8}>
        <CartesianGrid horizontal={false} stroke={t.grid} />
        <XAxis type="number" domain={[0, 1]} {...axisProps(t)} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
        <YAxis type="category" dataKey="name" width={130} {...axisProps(t)} tick={{ fill: t.textMuted, fontSize: 12 }} />
        <ReferenceLine x={0.85} stroke={t.muted} strokeDasharray="4 3" />
        <Tooltip
          cursor={{ fill: t.grid, opacity: 0.4 }}
          content={(p: TipProps) =>
            p.active && p.payload?.length ? (
              <TooltipBox
                title={p.label}
                rows={[
                  { label: 'Utilization', value: formatPercent(Number(p.payload[0].value)), color: t.series[0] },
                  ...(p.payload[0].payload.ci ? [{ label: '95% CI ±', value: formatPercent(p.payload[0].payload.ci) }] : [])
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="utilization" fill={t.series[0]} maxBarSize={24} radius={[0, 4, 4, 0]} label={{ position: 'right', fill: t.textMuted, fontSize: 11, formatter: (v: unknown) => formatPercent(Number(v), 0) }} />
      </BarChart>
    </ChartFrame>
  );
}

export interface HistogramDatum {
  label: string;
  from: number;
  to: number;
  count: number;
}

export function HistogramChart({ title, subtitle, data, color }: { title: string; subtitle?: string; data: HistogramDatum[]; color?: string }) {
  const t = useChartTheme();
  return (
    <ChartFrame title={title} subtitle={subtitle} height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 0 }} barCategoryGap={1}>
        <CartesianGrid vertical={false} stroke={t.grid} />
        <XAxis dataKey="label" {...axisProps(t)} interval="preserveStartEnd" minTickGap={18} />
        <YAxis {...axisProps(t)} allowDecimals={false} width={40} />
        <Tooltip
          cursor={{ fill: t.grid, opacity: 0.4 }}
          content={(p: TipProps) =>
            p.active && p.payload?.length ? (
              <TooltipBox
                title={`${formatDuration(p.payload[0].payload.from)} – ${formatDuration(p.payload[0].payload.to)}`}
                rows={[{ label: 'Cases', value: String(p.payload[0].value), color: color ?? t.series[0] }]}
              />
            ) : null
          }
        />
        <Bar dataKey="count" fill={color ?? t.series[0]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartFrame>
  );
}

export function LineSeriesChart({
  title,
  subtitle,
  data,
  xKey,
  series,
  xFormat,
  yFormat,
  area
}: {
  title: string;
  subtitle?: string;
  data: Array<Record<string, number>>;
  xKey: string;
  series: Array<{ key: string; label: string; colorIndex: 0 | 1 | 2 }>;
  xFormat: (v: number) => string;
  yFormat: (v: number) => string;
  area?: boolean;
}) {
  const t = useChartTheme();
  const legend = series.length > 1 ? <Legend items={series.map((s) => ({ label: s.label, color: t.series[s.colorIndex] }))} /> : undefined;
  const tooltip = (p: TipProps) =>
    p.active && p.payload?.length ? (
      <TooltipBox
        title={xFormat(Number(p.label))}
        rows={p.payload.map((pl) => {
          const s = series.find((x) => x.key === pl.dataKey)!;
          return { label: s.label, value: yFormat(Number(pl.value)), color: t.series[s.colorIndex] };
        })}
      />
    ) : null;
  return (
    <ChartFrame title={title} subtitle={subtitle} legend={legend} height={240}>
      {area ? (
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey={xKey} type="number" domain={['dataMin', 'dataMax']} {...axisProps(t)} tickFormatter={xFormat} minTickGap={28} />
          <YAxis {...axisProps(t)} width={44} tickFormatter={yFormat} />
          <Tooltip content={tooltip} />
          {series.map((s) => (
            <Area key={s.key} type="stepAfter" dataKey={s.key} stroke={t.series[s.colorIndex]} strokeWidth={2} fill={t.series[s.colorIndex]} fillOpacity={0.1} isAnimationActive={false} />
          ))}
        </AreaChart>
      ) : (
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey={xKey} type="number" domain={['dataMin', 'dataMax']} {...axisProps(t)} tickFormatter={xFormat} minTickGap={28} />
          <YAxis {...axisProps(t)} width={44} tickFormatter={yFormat} />
          <Tooltip content={tooltip} />
          {series.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={t.series[s.colorIndex]} strokeWidth={2} dot={false} isAnimationActive={false} />
          ))}
        </LineChart>
      )}
    </ChartFrame>
  );
}

export interface PairedDatum {
  name: string;
  a: number;
  b: number;
}

/** Grouped horizontal bars comparing two alternatives (e.g. AS-IS vs TO-BE). */
export function PairedBarChart({
  title,
  subtitle,
  data,
  labels,
  format
}: {
  title: string;
  subtitle?: string;
  data: PairedDatum[];
  labels: [string, string];
  format: (v: number) => string;
}) {
  const t = useChartTheme();
  const height = Math.max(160, data.length * 52 + 50);
  return (
    <ChartFrame title={title} subtitle={subtitle} height={height} legend={<Legend items={[{ label: labels[0], color: t.series[0] }, { label: labels[1], color: t.series[1] }]} />}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 30, bottom: 4, left: 8 }} barGap={2} barCategoryGap={10}>
        <CartesianGrid horizontal={false} stroke={t.grid} />
        <XAxis type="number" {...axisProps(t)} tickFormatter={format} />
        <YAxis type="category" dataKey="name" width={150} {...axisProps(t)} tick={{ fill: t.textMuted, fontSize: 12 }} />
        <Tooltip
          cursor={{ fill: t.grid, opacity: 0.4 }}
          content={(p: TipProps) =>
            p.active && p.payload?.length ? (
              <TooltipBox
                title={p.label}
                rows={[
                  { label: labels[0], value: format(Number(p.payload[0]?.payload.a)), color: t.series[0] },
                  { label: labels[1], value: format(Number(p.payload[0]?.payload.b)), color: t.series[1] }
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="a" fill={t.series[0]} maxBarSize={18} radius={[0, 4, 4, 0]} />
        <Bar dataKey="b" fill={t.series[1]} maxBarSize={18} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartFrame>
  );
}

/** Two overlaid distributions as step lines over shared bins. */
export function DistributionCompareChart({ title, data, labels }: { title: string; data: Array<{ x: number; a: number; b: number }>; labels: [string, string] }) {
  const t = useChartTheme();
  return (
    <ChartFrame title={title} subtitle="Share of cases per cycle-time bin" height={250} legend={<Legend items={[{ label: labels[0], color: t.series[0] }, { label: labels[1], color: t.series[1] }]} />}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid vertical={false} stroke={t.grid} />
        <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} {...axisProps(t)} tickFormatter={(v) => formatDuration(v, 0)} minTickGap={28} />
        <YAxis {...axisProps(t)} width={44} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
        <Tooltip
          content={(p: TipProps) =>
            p.active && p.payload?.length ? (
              <TooltipBox
                title={`≈ ${formatDuration(Number(p.label))}`}
                rows={[
                  { label: labels[0], value: formatPercent(Number(p.payload[0]?.payload.a)), color: t.series[0] },
                  { label: labels[1], value: formatPercent(Number(p.payload[0]?.payload.b)), color: t.series[1] }
                ]}
              />
            ) : null
          }
        />
        <Area type="stepAfter" dataKey="a" stroke={t.series[0]} strokeWidth={2} fill={t.series[0]} fillOpacity={0.1} isAnimationActive={false} />
        <Area type="stepAfter" dataKey="b" stroke={t.series[1]} strokeWidth={2} fill={t.series[1]} fillOpacity={0.1} isAnimationActive={false} />
      </AreaChart>
    </ChartFrame>
  );
}

export function PathChart({ data }: { data: Array<{ label: string; share: number; count: number }> }) {
  const t = useChartTheme();
  const height = Math.max(140, data.length * 34 + 40);
  return (
    <ChartFrame title="Process paths (variants)" subtitle="Share of completed cases per activity sequence" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }} barCategoryGap={8}>
        <CartesianGrid horizontal={false} stroke={t.grid} />
        <XAxis type="number" domain={[0, 1]} {...axisProps(t)} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
        <YAxis type="category" dataKey="label" width={60} {...axisProps(t)} tick={{ fill: t.textMuted, fontSize: 12 }} />
        <Tooltip
          cursor={{ fill: t.grid, opacity: 0.4 }}
          content={(p: TipProps) =>
            p.active && p.payload?.length ? (
              <TooltipBox title={p.label} rows={[{ label: 'Share', value: formatPercent(Number(p.payload[0].value)), color: t.series[0] }, { label: 'Cases', value: String(p.payload[0].payload.count) }]} />
            ) : null
          }
        />
        <Bar dataKey="share" fill={t.series[0]} maxBarSize={24} radius={[0, 4, 4, 0]} label={{ position: 'right', fill: t.textMuted, fontSize: 11, formatter: (v: unknown) => formatPercent(Number(v), 0) }} />
      </BarChart>
    </ChartFrame>
  );
}
