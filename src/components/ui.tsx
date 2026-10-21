/** Small shared UI primitives. */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Lightbulb, X, XCircle } from 'lucide-react';
import type { Severity } from '../domain/validation/types';

export function Modal({
  title,
  onClose,
  children,
  footer,
  width
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={ref} style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <span className="spacer" />
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label
}: {
  tabs: Array<{ id: T; label: ReactNode; badge?: ReactNode }>;
  value: T;
  onChange: (id: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" className="tab" aria-selected={t.id === value} onClick={() => onChange(t.id)}>
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  );
}

export function SeverityIcon({ severity, size = 16 }: { severity: Severity; size?: number }) {
  switch (severity) {
    case 'error':
      return <XCircle size={size} color="var(--error)" aria-label="Error" />;
    case 'warning':
      return <AlertTriangle size={size} color="var(--warning)" aria-label="Warning" />;
    case 'recommendation':
      return <Lightbulb size={size} color="var(--recommendation)" aria-label="Recommendation" />;
    default:
      return <Info size={size} color="var(--info)" aria-label="Information" />;
  }
}

export function Callout({ kind = 'info', title, children }: { kind?: 'info' | 'warning' | 'error' | 'success'; title?: ReactNode; children?: ReactNode }) {
  const Icon = kind === 'error' ? XCircle : kind === 'warning' ? AlertTriangle : kind === 'success' ? CheckCircle2 : Info;
  const color = kind === 'error' ? 'var(--error)' : kind === 'warning' ? 'var(--warning)' : kind === 'success' ? 'var(--success)' : 'var(--recommendation)';
  return (
    <div className={`callout callout-${kind}`}>
      <Icon size={18} color={color} aria-hidden />
      <div>
        {title && <strong style={{ display: 'block', marginBottom: children ? 2 : 0 }}>{title}</strong>}
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Minimal rich text: paragraphs separated by blank lines, `- ` bullet lists,
 * **bold**, *italic* and `code`. Content is authored in the repository, never user input.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className={`prose ${className ?? ''}`}>
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-•]\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
          return (
            <ol key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*\d+\.\s+/, ''))}</li>
              ))}
            </ol>
          );
        }
        return <p key={i}>{inline(lines.join(' '))}</p>;
      })}
    </div>
  );
}

function inline(s: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) parts.push(<strong key={k++}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) parts.push(<code key={k++}>{tok.slice(1, -1)}</code>);
    else parts.push(<em key={k++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}

export function downloadText(filename: string, text: string, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export function safeFileName(name: string) {
  return name.replace(/[^\w\-. ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'diagram';
}
