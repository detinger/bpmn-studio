import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { CHALLENGES } from '../../data/challenges';
import { CHALLENGE_TYPE_LABEL, type ChallengeType } from '../../domain/assessment/types';
import { useProgress } from '../../app/progress';
import { ProgressBar } from '../../components/ui';
import { ChallengeTypeIcon } from './ChallengeTypeIcon';

const TYPES = Object.keys(CHALLENGE_TYPE_LABEL) as ChallengeType[];

export default function ChallengesPage() {
  const { progress } = useProgress();
  const [filter, setFilter] = useState<ChallengeType | 'all'>('all');
  const passed = CHALLENGES.filter((c) => progress.challenges[c.id]?.status === 'passed').length;
  const shown = CHALLENGES.filter((c) => filter === 'all' || c.type === filter).sort((a, b) => a.level - b.level);

  return (
    <div className="page">
      <div className="page-narrow">
        <div className="page-header">
          <div>
            <div className="eyebrow">Challenges</div>
            <h1>Solve process problems</h1>
            <p>
              Build processes from business scenarios, repair broken models, predict executions, find deadlocks, redesign processes against performance targets and compare
              alternatives. Every result is explained: models are assessed by their behavior, not by how the diagram looks.
            </p>
          </div>
          <div className="card" style={{ minWidth: 240 }}>
            <div className="row">
              <strong>Solved</strong>
              <span className="spacer" />
              <span className="muted">
                {passed} / {CHALLENGES.length}
              </span>
            </div>
            <div style={{ marginTop: 8 }}>
              <ProgressBar value={passed / CHALLENGES.length} label="Challenges solved" />
            </div>
          </div>
        </div>

        <div className="chip-row" role="tablist" aria-label="Challenge type" style={{ marginBottom: 16 }}>
          <button role="tab" aria-selected={filter === 'all'} className={`chip${filter === 'all' ? ' selected' : ''}`} onClick={() => setFilter('all')}>
            All ({CHALLENGES.length})
          </button>
          {TYPES.map((t) => (
            <button key={t} role="tab" aria-selected={filter === t} className={`chip${filter === t ? ' selected' : ''}`} onClick={() => setFilter(t)}>
              <ChallengeTypeIcon type={t} size={12} /> {CHALLENGE_TYPE_LABEL[t]} ({CHALLENGES.filter((c) => c.type === t).length})
            </button>
          ))}
        </div>

        <div className="card-grid">
          {shown.map((c) => {
            const state = progress.challenges[c.id];
            return (
              <Link key={c.id} to={`/challenges/${c.id}`} className="card card-link level-card">
                <div className="row">
                  <span className="challenge-type subtle">
                    <ChallengeTypeIcon type={c.type} size={14} /> {CHALLENGE_TYPE_LABEL[c.type]}
                  </span>
                  <span className="spacer" />
                  {state?.status === 'passed' ? (
                    <span className="badge badge-success">Solved</span>
                  ) : state ? (
                    <span className="badge badge-warning">Best {Math.round(state.bestScore * 100)}%</span>
                  ) : null}
                </div>
                <strong style={{ fontSize: 15 }}>{c.title}</strong>
                <span className="muted">{c.summary}</span>
                <span className="row subtle" style={{ marginTop: 'auto' }}>
                  Level {c.level} · <Clock size={12} aria-hidden /> ~{c.minutes} min
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
