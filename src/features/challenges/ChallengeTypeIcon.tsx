import { Building2, Bug, Scale, Search, Sparkles, TrendingUp } from 'lucide-react';
import type { ChallengeType } from '../../domain/assessment/types';

const ICON = { build: Building2, fix: Bug, predict: Sparkles, deadlock: Search, improve: TrendingUp, compare: Scale } satisfies Record<ChallengeType, unknown>;

export function ChallengeTypeIcon({ type, size = 14 }: { type: ChallengeType; size?: number }) {
  const Icon = ICON[type];
  return <Icon size={size} aria-hidden />;
}
