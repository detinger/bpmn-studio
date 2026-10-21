import { useMemo } from 'react';
import { useTheme } from '../../app/theme';

export interface ChartTheme {
  series: [string, string, string];
  grid: string;
  axis: string;
  muted: string;
  text: string;
  textMuted: string;
  surface: string;
  status: { good: string; warning: string; serious: string; critical: string };
}

function read(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Chart colors resolved from CSS custom properties for the active theme. */
export function useChartTheme(): ChartTheme {
  const { resolved } = useTheme();
  return useMemo(
    () => ({
      series: [read('--chart-1', '#2a78d6'), read('--chart-2', '#eb6834'), read('--chart-3', '#1baf7a')],
      grid: read('--chart-grid', '#e1e0d9'),
      axis: read('--chart-axis', '#c3c2b7'),
      muted: read('--chart-muted', '#898781'),
      text: read('--text', '#17202c'),
      textMuted: read('--text-muted', '#4b5867'),
      surface: read('--chart-surface', '#ffffff'),
      status: {
        good: read('--status-good', '#0ca30c'),
        warning: read('--status-warning', '#fab219'),
        serious: read('--status-serious', '#ec835a'),
        critical: read('--status-critical', '#d03b3b')
      }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolved]
  );
}
