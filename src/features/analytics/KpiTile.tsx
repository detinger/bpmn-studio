import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

export type KpiStatus = 'good' | 'warning' | 'critical';

/** Stat tile: label · value · optional sub-line and status (icon + label, never color alone). */
export function KpiTile({ label, value, sub, status, delta }: { label: string; value: string; sub?: string; status?: KpiStatus; delta?: { text: string; good: boolean | null } }) {
  const Icon = status === 'good' ? CheckCircle2 : status === 'warning' ? AlertTriangle : status === 'critical' ? XCircle : null;
  const statusText = status === 'good' ? 'on target' : status === 'warning' ? 'below target' : status === 'critical' ? 'critical' : '';
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {delta && <div className={delta.good === null ? 'delta-neutral' : delta.good ? 'delta-good' : 'delta-bad'} style={{ fontSize: 12 }}>{delta.text}</div>}
      {sub && <div className="kpi-sub">{sub}</div>}
      {Icon && (
        <div className="kpi-sub row" style={{ gap: 4, marginTop: 2 }}>
          <Icon size={12} color={`var(--status-${status === 'warning' ? 'warning' : status === 'good' ? 'good' : 'critical'})`} aria-hidden /> {statusText}
        </div>
      )}
    </div>
  );
}
