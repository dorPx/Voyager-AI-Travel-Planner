'use client';

import type { PricePoint } from '../../../shared/types';

// Cross-session price trend UI. The backend records an observation per fresh
// scrape; here we compare today's price against the oldest observation in the
// window (≥12h old, so an intra-session flicker never reads as a "trend").

const MIN_BASELINE_AGE_MS = 12 * 60 * 60 * 1000;
const MIN_CHANGE_PCT = 2;

export interface Trend {
  change_pct: number;
  baseline_price: number;
  baseline_at: number;
}

export function computeTrend(currentPrice: number, points?: PricePoint[]): Trend | null {
  if (!(currentPrice > 0) || !points?.length) return null;
  const cutoff = Date.now() - MIN_BASELINE_AGE_MS;
  // Points arrive oldest-first — the first sufficiently old one is the baseline.
  const baseline = points.find((p) => p.observed_at <= cutoff && p.price > 0);
  if (!baseline) return null;
  const changePct = ((currentPrice - baseline.price) / baseline.price) * 100;
  if (Math.abs(changePct) < MIN_CHANGE_PCT) return null;
  return { change_pct: changePct, baseline_price: baseline.price, baseline_at: baseline.observed_at };
}

function daysAgo(ts: number): string {
  const days = Math.round((Date.now() - ts) / 86400000);
  if (days <= 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function TrendBadge({ trend }: { trend: Trend }) {
  const down = trend.change_pct < 0;
  const pct = Math.abs(Math.round(trend.change_pct));
  return (
    <span
      title={`Was $${trend.baseline_price.toFixed(0)}/night ${daysAgo(trend.baseline_at)}`}
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
        down ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {down ? '↓' : '↑'} {pct}% vs {daysAgo(trend.baseline_at)}
    </span>
  );
}

/** Tiny inline price sparkline — history points plus today's price. */
export function Sparkline({ points, currentPrice }: { points: PricePoint[]; currentPrice: number }) {
  const values = [...points.map((p) => p.price), currentPrice].filter((v) => v > 0);
  if (values.length < 2) return null;

  const w = 64;
  const h = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (w - 2) + 1;
      const y = h - 2 - ((v - min) / span) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const falling = values[values.length - 1] <= values[0];
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={falling ? 'text-emerald-600' : 'text-amber-600'}
      aria-label={`Price history: ${values.map((v) => `$${v.toFixed(0)}`).join(', ')}`}
      role="img"
    >
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
