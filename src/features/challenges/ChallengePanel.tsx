/** Challenge tab in the modeler: scenario, checks, progressive hints and assessment. */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, Lightbulb, Loader2, X } from 'lucide-react';
import { getChallenge } from '../../data/challenges';
import type { ImproveChallenge, ModelChallenge } from '../../domain/assessment/types';
import { RichText } from '../../components/ui';
import { AssessmentView } from './AssessmentView';
import { assessModelDiagram, type ModelAssessment } from './assess';
import { useProgress } from '../../app/progress';
import type { SimulationConfig } from '../../domain/simulation/config';

export function ChallengePanel({
  challengeId,
  getXml,
  config,
  onFocus,
  onClose
}: {
  challengeId: string;
  getXml: () => Promise<string>;
  config: SimulationConfig | null;
  onFocus: (ids: string[]) => void;
  onClose: () => void;
}) {
  const ch = getChallenge(challengeId) as ModelChallenge | ImproveChallenge | undefined;
  const { recordChallenge } = useProgress();
  const [hints, setHints] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<ModelAssessment | null>(null);

  if (!ch || (ch.type !== 'build' && ch.type !== 'fix' && ch.type !== 'improve')) return <div className="panel-pad muted">Unknown challenge.</div>;

  const check = async () => {
    setBusy('Checking your model…');
    try {
      const xml = await getXml();
      const a = await assessModelDiagram(ch, xml, config ?? undefined, setBusy);
      setAssessment(a);
      recordChallenge(ch.id, a.result, hints);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="panel-pad stack" style={{ gap: 12 }}>
      <div className="row">
        <span className="eyebrow" style={{ margin: 0 }}>
          Challenge
        </span>
        <span className="spacer" />
        <Link className="btn btn-sm btn-ghost" to={`/challenges/${ch.id}`}>
          Details
        </Link>
        <button className="btn btn-sm btn-ghost btn-icon" onClick={onClose} aria-label="Close challenge">
          <X size={14} />
        </button>
      </div>
      <h3 style={{ margin: 0 }}>{ch.title}</h3>
      <RichText text={ch.scenario} />
      <details>
        <summary className="subtle">What will be checked ({ch.criteria.length + (ch.type === 'improve' ? ch.targets.length + 1 : 0)} criteria)</summary>
        <ul className="compact-list" style={{ marginTop: 6 }}>
          {ch.criteria.map((c, i) => (
            <li key={i}>{describeCriterion(c, ch)}</li>
          ))}
          {ch.type === 'improve' && ch.targets.map((t) => <li key={t.label}>{t.label}</li>)}
          {ch.type === 'improve' && <li>At most {ch.maxWorkers} workers</li>}
        </ul>
      </details>
      <div>
        {ch.hints.slice(0, hints).map((h, i) => (
          <div key={i} className="callout" style={{ marginBottom: 6 }}>
            <Lightbulb size={14} color="var(--accent)" />
            <span style={{ fontSize: 13 }}>
              <strong>Hint {i + 1}:</strong> {h}
            </span>
          </div>
        ))}
        {hints < ch.hints.length && (
          <button className="btn btn-sm" onClick={() => setHints(hints + 1)}>
            <Lightbulb size={14} /> {hints === 0 ? 'Show a hint' : 'Next hint'} ({hints}/{ch.hints.length})
          </button>
        )}
      </div>
      <button className="btn btn-primary" onClick={check} disabled={!!busy}>
        {busy ? <Loader2 size={15} className="spin" /> : <ClipboardCheck size={15} />} {busy ?? 'Check my solution'}
      </button>
      {assessment && <AssessmentView result={assessment.result} notes={assessment.notes} onFocus={onFocus} />}
    </div>
  );
}

export function describeCriterion(c: ModelChallenge['criteria'][number], ch: ModelChallenge | ImproveChallenge): string {
  const role = (id: string) => `“${ch.roles.find((r) => r.id === id)?.label ?? id}”`;
  switch (c.kind) {
    case 'role':
      return `The model contains ${role(c.role)}`;
    case 'gateway':
      return c.label;
    case 'endEvents':
      return `At least ${c.min} named end events`;
    case 'sound':
      return 'Sound control flow (no deadlocks, no duplicated work, no dead paths)';
    case 'noErrors':
      return 'No BPMN errors in the validator';
    case 'always':
      return `${role(c.role)} happens in every case`;
    case 'optional':
      return `${role(c.role)} happens only in some cases`;
    case 'exclusive':
      return `${role(c.roles[0])} and ${role(c.roles[1])} never happen in the same case`;
    case 'precedes':
      return `${role(c.before)} happens before ${role(c.after)}`;
    case 'concurrent':
      return `${role(c.roles[0])} and ${role(c.roles[1])} can run in parallel`;
    case 'boundary':
      return `A ${c.interrupting === false ? 'non-interrupting ' : c.interrupting ? 'interrupting ' : ''}${c.event} boundary event on ${role(c.role)} with an exception path`;
    case 'pools':
      return `At least ${c.min} pools`;
    case 'messageFlows':
      return `At least ${c.min} message flows`;
  }
}
