import { Brain, Bug, Building2, FlaskConical, Footprints, GitFork, Layers, PenTool, Scale, Search, Sparkles, TrendingUp, Users, Workflow, Award, type LucideIcon } from 'lucide-react';
import { BADGES } from '../../data/badges';

const ICONS: Record<string, LucideIcon> = { Brain, Bug, Building2, FlaskConical, Footprints, GitFork, Layers, PenTool, Scale, Search, Sparkles, TrendingUp, Users, Workflow };

export function BadgeGrid({ earned }: { earned: string[] }) {
  return (
    <div className="badge-grid">
      {BADGES.map((b) => {
        const Icon = ICONS[b.icon] ?? Award;
        const has = earned.includes(b.id);
        return (
          <div key={b.id} className={`badge-tile${has ? '' : ' locked'}`} title={b.description}>
            <Icon size={24} aria-hidden />
            <strong>{b.name}</strong>
            <span>{has ? b.description : `Locked — ${b.description}`}</span>
          </div>
        );
      })}
    </div>
  );
}
